import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { adaptGenerationConfig, adaptModificationSource } from '@/shared/api/adapters'
import {
  useGenerationConfigQuery,
  useModificationSourceQuery,
  useStartModificationMutation,
} from '@/shared/api/workflow.hooks'
import { useWorkflowSocket } from '@/shared/api/workflow.socket'
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { useSessionStore } from '@/store/session/session.store'
import { TrainingLogPanel } from '@/features/fine-tune-training/TrainingLogPanel'
import { GenerationConfigFields } from '@/features/generation-config/GenerationConfigFields'
import '@/features/generation-config/generation-config.css'

type ModifyFormValues = {
  prompt: string
  sampleCount: number
}

export function ModifyPage() {
  const navigate = useNavigate()
  const sessionId = useSessionStore((state) => state.sessionId)
  const generationJobId = useSessionStore((state) => state.generationJobId)
  const generationConfig = useSessionStore((state) => state.generationConfig)
  const setSession = useSessionStore((state) => state.setSession)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(generationConfig)
  const [logs, setLogs] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const configQuery = useGenerationConfigQuery(sessionId)
  const sourceQuery = useModificationSourceQuery(sessionId)
  const modificationMutation = useStartModificationMutation(sessionId ?? '')
  const form = useForm<ModifyFormValues>({
    defaultValues: {
      prompt: '',
      sampleCount: 1,
    },
  })

  useEffect(() => {
    setSession({ workflowStage: 'modify' })
  }, [setSession])

  useEffect(() => {
    if (!configQuery.data) {
      return
    }

    const config = adaptGenerationConfig(configQuery.data)
    const nextFieldValues = Object.fromEntries(config.fields.map((field) => [field.key, field.value]))
    setFieldValues(nextFieldValues)
    setSession({ generationConfig: nextFieldValues })
    form.reset({
      prompt: '',
      sampleCount: config.sampleCount,
    })
  }, [configQuery.data, form, setSession])

  useEffect(() => {
    if (configQuery.error) {
      setErrorMessage(getErrorMessage(configQuery.error))
    }

    if (sourceQuery.error) {
      setErrorMessage(getErrorMessage(sourceQuery.error))
    }
  }, [configQuery.error, sourceQuery.error])

  useWorkflowSocket({
    sessionId,
    onError: () => setErrorMessage('Соединение WebSocket для модификации недоступно.'),
    onMessage: (event) => {
      if (event.jobId && generationJobId && event.jobId !== generationJobId) {
        return
      }

      if (event.type === 'modification.progress') {
        const { progress, message } = event.payload
        const label = [
          typeof progress === 'number' ? `готово ${Math.round(progress * 100)}%` : null,
          message ?? null,
        ]
          .filter(Boolean)
          .join(' | ')

        if (label) {
          setLogs((current) => [...current, label])
        }
      }

      if (event.type === 'task.completed' && generationJobId && event.jobId === generationJobId) {
        setSession({ workflowStage: 'review' })
        navigate('/review')
      }

      if (event.type === 'task.failed' && generationJobId && event.jobId === generationJobId) {
        setErrorMessage(event.payload.message ?? 'Модификация завершилась с ошибкой.')
      }
    },
  })

  const fields = useMemo(() => configQuery.data?.fields ?? [], [configQuery.data?.fields])
  const source = useMemo(() => {
    if (!sourceQuery.data) {
      return null
    }

    return adaptModificationSource(sourceQuery.data.assetPath)
  }, [sourceQuery.data])

  const updateFieldValue = (key: string, value: string) => {
    const nextValues = { ...fieldValues, [key]: value }
    setFieldValues(nextValues)
    setSession({ generationConfig: nextValues })
  }

  const submitForm = form.handleSubmit(async (values) => {
    if (!sessionId || !source) {
      return
    }

    try {
      const response = await modificationMutation.mutateAsync({
        prompt: values.prompt,
        sourcePath: source.assetPath,
        sampleCount: Number(values.sampleCount),
        config: fieldValues,
      })
      setSession({ generationJobId: response.jobId })
      setLogs(['Запуск модификации отправлен на бэкенд.'])
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  })

  return (
    <>
      <PageFrame
        title="Модификация"
        description="В центре выбранный исходный кадр, ниже параметры новой партии изображений."
      >
        {(configQuery.isLoading || sourceQuery.isLoading) && (
          <div className="upload-stage__loading">
            <Spinner label="Подтягиваю изображение и параметры модификации." />
          </div>
        )}

        {!configQuery.isLoading && !sourceQuery.isLoading && source ? (
          <div className="modify-layout">
            <section className="modify-stage">
              <span className="modify-stage__class">{sourceQuery.data?.className ?? 'Класс не найден'}</span>
              <img alt="Источник для модификации" className="modify-preview modify-preview--hero" src={source.assetUrl} />
            </section>

            <form className="generation-form generation-form--stacked" onSubmit={submitForm}>
              <label className="generation-form__group">
                <span className="generation-form__label">Промпт модификации</span>
                <textarea
                  className="generation-form__textarea"
                  placeholder="Опиши, какую вариацию нужно получить на основе этого изображения."
                  {...form.register('prompt', { required: true })}
                />
              </label>

              <label className="generation-form__group">
                <span className="generation-form__label">Количество новых изображений</span>
                <input
                  className="generation-form__input"
                  min={1}
                  step={1}
                  type="number"
                  {...form.register('sampleCount', { required: true, min: 1, valueAsNumber: true })}
                />
              </label>

              <GenerationConfigFields fields={fields} onChange={updateFieldValue} values={fieldValues} />

              <Button disabled={modificationMutation.isPending} type="submit">
                Запустить модификацию
              </Button>
            </form>
          </div>
        ) : null}

        {modificationMutation.isPending || generationJobId ? (
          <div className="upload-stage__loading">
            <Spinner
              label="Модификация выполняется. После завершения откроется экран отбора."
              tone="diffusion"
            />
          </div>
        ) : null}

        <TrainingLogPanel
          emptyLabel="Логи модификации появятся после запуска задачи."
          logs={logs}
          title="Поток логов модификации"
        />
      </PageFrame>

      <Modal
        onClose={() => setErrorMessage(null)}
        open={Boolean(errorMessage)}
        title="Ошибка модификации"
        tone="error"
      >
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>
    </>
  )
}
