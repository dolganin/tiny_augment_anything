import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useStartClassifierTrainingMutation, useTaskStatusQuery } from '@/shared/api/workflow.hooks'
import { useWorkflowSocket } from '@/shared/api/workflow.socket'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { useSessionStore } from '@/store/session/session.store'
import { TrainingLogPanel } from '@/features/fine-tune-training/TrainingLogPanel'
import '@/features/generation-config/generation-config.css'

type ClassifierFormValues = {
  modelKey: string
  trainBatchSize: number
  valBatchSize: number
  learningRate: number
  weightDecay: number
  epochs: number
}

const CLASSIFIER_MODELS = [
  { value: 'EdgeNeXt_finetune', label: 'EdgeNeXt' },
  { value: 'EVA02-small_finetune', label: 'EVA02-small' },
]

export function ClassifierTrainPage() {
  const navigate = useNavigate()
  const sessionId = useSessionStore((state) => state.sessionId)
  const classifierJobId = useSessionStore((state) => state.classifierJobId)
  const setSession = useSessionStore((state) => state.setSession)
  const [logs, setLogs] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [weightsFile, setWeightsFile] = useState<File | null>(null)
  const taskSnapshotRef = useRef<string | null>(null)
  const classifierMutation = useStartClassifierTrainingMutation(sessionId ?? '')
  const taskStatusQuery = useTaskStatusQuery(sessionId, classifierJobId)
  const form = useForm<ClassifierFormValues>({
    defaultValues: {
      modelKey: 'EdgeNeXt_finetune',
      trainBatchSize: 32,
      valBatchSize: 64,
      learningRate: 0.0003,
      weightDecay: 0.000001,
      epochs: 10,
    },
  })

  useEffect(() => {
    setSession({ workflowStage: 'classifier-train' })
  }, [setSession])

  useEffect(() => {
    taskSnapshotRef.current = null
  }, [classifierJobId])

  const appendLog = (line: string) => {
    setLogs((current) => [...current, line])
  }

  useWorkflowSocket({
    sessionId,
    onError: () =>
      setLogs((current) =>
        current.includes('WebSocket недоступен, продолжаю через polling статуса задачи.')
          ? current
          : [...current, 'WebSocket недоступен, продолжаю через polling статуса задачи.'],
      ),
    onMessage: (event) => {
      if (event.jobId && classifierJobId && event.jobId !== classifierJobId) {
        return
      }

      if (event.type === 'classifier.progress') {
        const { phase, progress, epoch, totalEpochs, message } = event.payload
        const chunks = [
          typeof phase === 'string' ? `phase ${phase}` : null,
          typeof progress === 'number' ? `готово ${Math.round(progress * 100)}%` : null,
          epoch ? `epoch ${epoch}` : null,
          totalEpochs ? `из ${totalEpochs}` : null,
          message ?? null,
        ].filter(Boolean)

        if (chunks.length > 0) {
          appendLog(chunks.join(' | '))
        }
      }

      if (event.type === 'task.completed' && classifierJobId && event.jobId === classifierJobId) {
        setSession({ workflowStage: 'metrics', classifierJobId: null })
        navigate('/metrics')
      }

      if (event.type === 'task.failed' && classifierJobId && event.jobId === classifierJobId) {
        appendLog(`Ошибка: ${event.payload.message ?? 'Обучение классификатора завершилось с ошибкой.'}`)
        setSession({ classifierJobId: null })
        setErrorMessage(event.payload.message ?? 'Обучение классификатора завершилось с ошибкой.')
      }
    },
  })

  useEffect(() => {
    if (!taskStatusQuery.error) {
      return
    }
    appendLog(`Ошибка polling: ${getErrorMessage(taskStatusQuery.error)}`)
    setSession({ classifierJobId: null })
    setErrorMessage(getErrorMessage(taskStatusQuery.error))
  }, [setSession, taskStatusQuery.error])

  useEffect(() => {
    if (!taskStatusQuery.data || !classifierJobId) {
      return
    }
    const { status, progress, message, error } = taskStatusQuery.data
    const resolvedMessage = error?.message ?? message ?? null
    const snapshot = [status, progress ?? 'null', resolvedMessage ?? ''].join('|')
    if (snapshot === taskSnapshotRef.current) {
      return
    }
    taskSnapshotRef.current = snapshot

    if (status === 'pending' || status === 'running') {
      const label = [
        typeof progress === 'number' ? `готово ${Math.round(progress * 100)}%` : null,
        resolvedMessage,
      ]
        .filter(Boolean)
        .join(' | ')
      if (label) {
        appendLog(label)
      }
      return
    }

    if (status === 'success') {
      setSession({ workflowStage: 'metrics', classifierJobId: null })
      navigate('/metrics')
      return
    }

    if (status === 'error' || status === 'cancelled') {
      appendLog(`Ошибка: ${resolvedMessage ?? 'Обучение классификатора завершилось с ошибкой.'}`)
      setSession({ classifierJobId: null })
      setErrorMessage(resolvedMessage ?? 'Обучение классификатора завершилось с ошибкой.')
    }
  }, [classifierJobId, navigate, setSession, taskStatusQuery.data])

  const handleWeightsChange = (event: ChangeEvent<HTMLInputElement>) => {
    setWeightsFile(event.target.files?.[0] ?? null)
  }

  const submitForm = form.handleSubmit(async (values) => {
    if (!sessionId) {
      return
    }

    const payload = new FormData()
    payload.append('modelKey', values.modelKey)
    payload.append('trainBatchSize', String(values.trainBatchSize))
    payload.append('valBatchSize', String(values.valBatchSize))
    payload.append('learningRate', String(values.learningRate))
    payload.append('weightDecay', String(values.weightDecay))
    payload.append('epochs', String(values.epochs))
    if (weightsFile) {
      payload.append('weights', weightsFile)
    }

    try {
      const response = await classifierMutation.mutateAsync(payload)
      setSession({ classifierJobId: response.jobId, workflowStage: 'classifier-train' })
      setErrorMessage(null)
      setLogs([
        weightsFile
          ? `Задача обучения классификатора отправлена. Загружены веса ${weightsFile.name}.`
          : 'Задача обучения классификатора отправлена без внешних весов.',
      ])
    } catch (error) {
      appendLog(`Ошибка запуска: ${getErrorMessage(error)}`)
      setErrorMessage(getErrorMessage(error))
    }
  })

  return (
    <>
      <PageFrame title="Обучение классификатора">
        <div className="info-card">
          <p className="info-card__text">
            Head checkpoint подменяется автоматически: старый classifier head не загружается.
          </p>
          <p className="info-card__text">
            Новый head собирается каскадом <strong>backbone dim → 512 → 256 → классы текущего датасета</strong>.
          </p>
        </div>

        {!classifierJobId ? (
          <form className="generation-form generation-form--stacked" onSubmit={submitForm}>
            <label className="generation-form__group">
              <span className="generation-form__label">Модель классификатора</span>
              <select className="generation-form__input" {...form.register('modelKey', { required: true })}>
                {CLASSIFIER_MODELS.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="generation-form__group">
              <span className="generation-form__label">Pretrain-веса (опционально)</span>
              <input
                accept=".bin,.ckpt,.pt,.pth"
                className="generation-form__input"
                onChange={handleWeightsChange}
                type="file"
              />
            </label>

            <label className="generation-form__group">
              <span className="generation-form__label">Train batch size</span>
              <input
                className="generation-form__input"
                min={1}
                step={1}
                type="number"
                {...form.register('trainBatchSize', { required: true, min: 1, valueAsNumber: true })}
              />
            </label>

            <label className="generation-form__group">
              <span className="generation-form__label">Val batch size</span>
              <input
                className="generation-form__input"
                min={1}
                step={1}
                type="number"
                {...form.register('valBatchSize', { required: true, min: 1, valueAsNumber: true })}
              />
            </label>

            <label className="generation-form__group">
              <span className="generation-form__label">Learning rate</span>
              <input
                className="generation-form__input"
                min={0.000001}
                step={0.000001}
                type="number"
                {...form.register('learningRate', { required: true, min: 0.000001, valueAsNumber: true })}
              />
            </label>

            <label className="generation-form__group">
              <span className="generation-form__label">Weight decay</span>
              <input
                className="generation-form__input"
                min={0}
                step={0.000001}
                type="number"
                {...form.register('weightDecay', { required: true, min: 0, valueAsNumber: true })}
              />
            </label>

            <label className="generation-form__group">
              <span className="generation-form__label">Epochs</span>
              <input
                className="generation-form__input"
                min={1}
                step={1}
                type="number"
                {...form.register('epochs', { required: true, min: 1, valueAsNumber: true })}
              />
            </label>

            <div className="info-card">
              <p className="info-card__text">
                Если веса не загрузить, запуск пойдёт на базовой инициализации выбранной модели.
              </p>
              <p className="info-card__text">
                Валидация собирается только из исходных изображений, синтетика в неё не попадает.
              </p>
              <p className="info-card__text">
                По классам берётся максимально ровный val split, а в train остаются остаток originals и вся синтетика.
              </p>
            </div>

            <Button disabled={classifierMutation.isPending} type="submit">
              Запустить обучение
            </Button>
          </form>
        ) : null}

        {classifierJobId && !errorMessage ? (
          <div className="upload-stage__loading">
            <Spinner
              label="Классификатор обучается. После завершения откроется экран метрик."
              tone="diffusion"
            />
          </div>
        ) : null}

        <TrainingLogPanel
          emptyLabel="Логи классификатора появятся после первого сообщения от WebSocket."
          logs={logs}
          title="Поток логов классификатора"
        />
      </PageFrame>

      <Modal
        onClose={() => setErrorMessage(null)}
        open={Boolean(errorMessage)}
        title="Ошибка обучения классификатора"
        tone="error"
      >
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>
    </>
  )
}
