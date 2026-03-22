import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStartFineTuneMutation, useSyncWorkflowStateMutation, useTaskStatusQuery } from '@/shared/api/workflow.hooks'
import { useWorkflowSocket } from '@/shared/api/workflow.socket'
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { useSessionStore } from '@/store/session/session.store'
import { TrainingLogPanel } from '@/features/fine-tune-training/TrainingLogPanel'

export function FineTunePage() {
  const navigate = useNavigate()
  const sessionId = useSessionStore((state) => state.sessionId)
  const fineTuneJobId = useSessionStore((state) => state.fineTuneJobId)
  const fineTuneEnabled = useSessionStore((state) => state.fineTuneEnabled)
  const fineTuneResolved = useSessionStore((state) => state.fineTuneResolved)
  const setSession = useSessionStore((state) => state.setSession)
  const [logs, setLogs] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const taskSnapshotRef = useRef<string | null>(null)
  const fineTuneMutation = useStartFineTuneMutation(sessionId ?? '')
  const syncWorkflowStateMutation = useSyncWorkflowStateMutation(sessionId ?? '')
  const taskStatusQuery = useTaskStatusQuery(sessionId, fineTuneJobId)

  const appendLog = (entry: string) => {
    setLogs((current) => [...current, entry])
  }

  useEffect(() => {
    setSession({ workflowStage: 'fine-tune' })
  }, [setSession])

  useEffect(() => {
    taskSnapshotRef.current = null
  }, [fineTuneJobId])

  useWorkflowSocket({
    sessionId,
    onError: () =>
      setLogs((current) =>
        current.includes('WebSocket недоступен, продолжаю через polling статуса задачи.')
          ? current
          : [...current, 'WebSocket недоступен, продолжаю через polling статуса задачи.'],
      ),
    onMessage: (event) => {
      if (event.jobId && fineTuneJobId && event.jobId !== fineTuneJobId) {
        return
      }

      if (event.type === 'fine_tune.progress') {
        const { phase, message, progress } = event.payload
        const chunks = [
          typeof phase === 'string' && phase ? `phase ${phase}` : null,
          typeof progress === 'number' ? `готово ${Math.round(progress * 100)}%` : null,
          message ?? null,
        ].filter(Boolean)

        if (chunks.length > 0) {
          appendLog(chunks.join(' | '))
        }
      }

      if (event.type === 'task.completed' && fineTuneJobId && event.jobId === fineTuneJobId) {
        appendLog(event.payload.message ?? 'Инициализация модели завершена.')
        setSession({
          fineTuneResolved: true,
          fineTuneJobId: null,
          workflowStage: 'modify',
        })
        navigate('/modify')
      }

      if (event.type === 'task.failed' && fineTuneJobId && event.jobId === fineTuneJobId) {
        appendLog(`Ошибка: ${event.payload.message ?? 'Инициализация модели завершилась с ошибкой.'}`)
        setSession({
          fineTuneEnabled: false,
          fineTuneResolved: false,
          fineTuneJobId: null,
        })
        setErrorMessage(event.payload.message ?? 'Бэкенд вернул ошибку во время инициализации модели.')
      }
    },
  })

  useEffect(() => {
    if (!taskStatusQuery.error) {
      return
    }
    appendLog(`Ошибка: ${getErrorMessage(taskStatusQuery.error)}`)
    setSession({
      fineTuneEnabled: false,
      fineTuneResolved: false,
      fineTuneJobId: null,
    })
    setErrorMessage(getErrorMessage(taskStatusQuery.error))
  }, [setSession, taskStatusQuery.error])

  useEffect(() => {
    if (!fineTuneJobId || !taskStatusQuery.data) {
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
      appendLog(resolvedMessage ?? 'Инициализация модели завершена.')
      setSession({
        fineTuneEnabled: true,
        fineTuneResolved: true,
        fineTuneJobId: null,
        workflowStage: 'modify',
      })
      navigate('/modify')
      return
    }

    if (status === 'error' || status === 'cancelled') {
      appendLog(`Ошибка: ${resolvedMessage ?? 'Инициализация модели завершилась с ошибкой.'}`)
      setSession({
        fineTuneEnabled: false,
        fineTuneResolved: false,
        fineTuneJobId: null,
      })
      setErrorMessage(resolvedMessage ?? 'Бэкенд вернул ошибку во время инициализации модели.')
    }
  }, [fineTuneJobId, navigate, setSession, taskStatusQuery.data])

  const startFineTune = async () => {
    if (!sessionId) {
      return
    }

    try {
      const response = await fineTuneMutation.mutateAsync()
      setSession({
        fineTuneEnabled: true,
        fineTuneResolved: false,
        fineTuneJobId: response.jobId,
      })
      appendLog('Задача инициализации модели отправлена на бэкенд.')
    } catch (error) {
      appendLog(`Ошибка: ${getErrorMessage(error)}`)
      setErrorMessage(getErrorMessage(error))
    }
  }

  const skipFineTune = async () => {
    try {
      if (sessionId) {
        await syncWorkflowStateMutation.mutateAsync({
          workflowStage: 'modify',
          fineTuneEnabled: false,
          fineTuneResolved: true,
        })
      }
      setSession({
        fineTuneEnabled: false,
        fineTuneResolved: true,
        fineTuneJobId: null,
        workflowStage: 'modify',
      })
      appendLog('Инициализация пропущена, будет использован ленивый запуск.')
      navigate('/modify')
    } catch (error) {
      appendLog(`Ошибка: ${getErrorMessage(error)}`)
      setErrorMessage(getErrorMessage(error))
    }
  }

  return (
    <>
      <PageFrame
        title="Инициализация модели"
      >
        <div className="info-card">
          <p className="info-card__text">
            Генерация с нуля из интерфейса отключена. Дальше доступна только модификация существующих изображений датасета.
          </p>
          <div className="class-selection__footer">
            <Button
              disabled={fineTuneMutation.isPending || fineTuneEnabled}
              onClick={startFineTune}
            >
              Загрузить модель заранее
            </Button>
            <Button
              disabled={fineTuneMutation.isPending || syncWorkflowStateMutation.isPending || fineTuneEnabled}
              onClick={skipFineTune}
              variant="ghost"
            >
              Перейти без ожидания
            </Button>
          </div>
        </div>

        {(fineTuneMutation.isPending || fineTuneEnabled || fineTuneJobId) && !errorMessage ? (
          <div className="upload-stage__loading">
            <Spinner label="ml-worker инициализирует модель и сообщает, когда runtime уже готов на устройстве." tone="diffusion" />
          </div>
        ) : null}

        <TrainingLogPanel
          emptyLabel="Логи инициализации появятся здесь после старта задачи."
          logs={logs}
          title="Поток логов инициализации"
        />
      </PageFrame>

      <Modal
        onClose={() => setErrorMessage(null)}
        open={Boolean(errorMessage)}
        title="Ошибка инициализации модели"
        tone="error"
      >
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>
    </>
  )
}
