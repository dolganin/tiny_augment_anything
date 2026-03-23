import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { adaptGenerationConfig } from '@/shared/api/adapters'
import {
  useGenerationConfigQuery,
  useStartGenerationMutation,
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

type GenerateFormValues = {
  prompt: string
}

export function GeneratePage() {
  const navigate = useNavigate()
  const sessionId = useSessionStore((state) => state.sessionId)
  const generationJobId = useSessionStore((state) => state.generationJobId)
  const generationConfig = useSessionStore((state) => state.generationConfig)
  const selectedClassTargets = useSessionStore((state) => state.selectedClassTargets)
  const setSession = useSessionStore((state) => state.setSession)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(generationConfig)
  const [logs, setLogs] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const configQuery = useGenerationConfigQuery(sessionId)
  const generationMutation = useStartGenerationMutation(sessionId ?? '')
  const form = useForm<GenerateFormValues>({
    defaultValues: {
      prompt: '',
    },
  })

  useEffect(() => {
    setSession({ workflowStage: 'generate' })
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
    })
  }, [configQuery.data, form, setSession])

  useEffect(() => {
    if (!configQuery.error) {
      return
    }

    setErrorMessage(getErrorMessage(configQuery.error))
  }, [configQuery.error])

  useWorkflowSocket({
    sessionId,
    onError: () => setErrorMessage('Соединение WebSocket для генерации недоступно.'),
    onMessage: (event) => {
      if (event.jobId && generationJobId && event.jobId !== generationJobId) {
        return
      }

      if (event.type === 'generation.progress') {
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
        setSession({ workflowStage: 'review', generationJobId: null })
        navigate('/review')
      }

      if (event.type === 'task.failed' && generationJobId && event.jobId === generationJobId) {
        setSession({ generationJobId: null })
        setErrorMessage(event.payload.message ?? 'Генерация завершилась с ошибкой.')
      }
    },
  })

  const fields = useMemo(() => configQuery.data?.fields ?? [], [configQuery.data?.fields])

  const updateFieldValue = (key: string, value: string) => {
    const nextValues = { ...fieldValues, [key]: value }
    setFieldValues(nextValues)
    setSession({ generationConfig: nextValues })
  }

  const totalTargetCount = useMemo(
    () => Object.values(selectedClassTargets).reduce((acc, value) => acc + value, 0),
    [selectedClassTargets],
  )

  const submitForm = form.handleSubmit(async (values) => {
    if (!sessionId) {
      return
    }
    if (totalTargetCount <= 0) {
      setErrorMessage('Сначала задай целевые количества по классам на этапе статистики.')
      return
    }

    try {
      const response = await generationMutation.mutateAsync({
        prompt: values.prompt,
        sampleCount: totalTargetCount,
        classTargets: selectedClassTargets,
        config: fieldValues,
      })
      setSession({ generationJobId: response.jobId })
      setLogs(['Запуск генерации отправлен на бэкенд.'])
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  })

  return (
    <>
      <PageFrame
        title="Генерация по промпту"
        description="Промпт задаётся слева, а набор параметров, пришедших из YAML-конфига, редактируется как обычные текстовые поля."
        aside={<GenerateAside fieldCount={fields.length} />}
      >
        {configQuery.isLoading ? (
          <div className="upload-stage__loading">
            <Spinner label="Запрашиваю конфигурацию генерации и подготавливаю форму." />
          </div>
        ) : null}

        {!configQuery.isLoading ? (
          <form className="generation-form" onSubmit={submitForm}>
            <label className="generation-form__group">
              <span className="generation-form__label">Текстовый промпт</span>
              <textarea
                className="generation-form__textarea"
                placeholder="Опиши желаемое изображение для генерации."
                {...form.register('prompt', { required: true })}
              />
            </label>

            <div className="info-card">
              <p className="info-card__text">
                План генерации взят со страницы статистики: <strong>{totalTargetCount}</strong> изображений суммарно.
              </p>
            </div>

            <GenerationConfigFields fields={fields} onChange={updateFieldValue} values={fieldValues} />

            <Button disabled={generationMutation.isPending} type="submit">
              Запустить генерацию
            </Button>
          </form>
        ) : null}

        {generationMutation.isPending || generationJobId ? (
          <div className="upload-stage__loading">
            <Spinner label="Генерация выполняется. После завершения откроется экран отбора." tone="diffusion" />
          </div>
        ) : null}

        <TrainingLogPanel
          emptyLabel="Логи генерации появятся после запуска задачи."
          logs={logs}
          title="Поток логов генерации"
        />
      </PageFrame>

      <Modal
        onClose={() => setErrorMessage(null)}
        open={Boolean(errorMessage)}
        title="Ошибка генерации"
        tone="error"
      >
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>
    </>
  )
}

function GenerateAside({ fieldCount }: { fieldCount: number }) {
  return (
    <div className="info-card">
      <p className="info-card__text">
        Редактируемых полей в конфиге: <strong>{fieldCount}</strong>
      </p>
      <p className="info-card__text">
        Все значения отправляются на бэкенд строками и приводятся к нужным типам на backend-контракте.
      </p>
    </div>
  )
}
