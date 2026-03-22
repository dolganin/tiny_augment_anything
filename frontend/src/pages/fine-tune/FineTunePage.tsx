import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStartFineTuneMutation, useSyncWorkflowStateMutation } from '@/shared/api/workflow.hooks'
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
  const setSession = useSessionStore((state) => state.setSession)
  const [logs, setLogs] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fineTuneMutation = useStartFineTuneMutation(sessionId ?? '')
  const syncWorkflowStateMutation = useSyncWorkflowStateMutation(sessionId ?? '')

  useEffect(() => {
    setSession({ workflowStage: 'fine-tune' })
  }, [setSession])

  useWorkflowSocket({
    sessionId,
    onError: () => setErrorMessage('Соединение WebSocket для логов обучения оборвалось.'),
    onMessage: (event) => {
      if (event.jobId && fineTuneJobId && event.jobId !== fineTuneJobId) {
        return
      }

      if (event.type === 'fine_tune.progress') {
        const { epoch, totalEpochs, loss, etaSeconds, message } = event.payload
        const chunks = [
          epoch ? `epoch ${epoch}` : null,
          totalEpochs ? `из ${totalEpochs}` : null,
          typeof loss === 'number' ? `loss ${loss.toFixed(4)}` : null,
          typeof etaSeconds === 'number' ? `eta ${etaSeconds}с` : null,
          message ?? null,
        ].filter(Boolean)

        if (chunks.length > 0) {
          setLogs((current) => [...current, chunks.join(' | ')])
        }
      }

      if (event.type === 'task.completed' && fineTuneJobId && event.jobId === fineTuneJobId) {
        setSession({
          fineTuneResolved: true,
          workflowStage: 'modify',
        })
        navigate('/modify')
      }

      if (event.type === 'task.failed' && fineTuneJobId && event.jobId === fineTuneJobId) {
        setSession({
          fineTuneEnabled: false,
          fineTuneResolved: false,
        })
        setErrorMessage(event.payload.message ?? 'Бэкенд вернул ошибку во время подготовки модели.')
      }
    },
  })

  const statusLabel = useMemo(() => {
    if (fineTuneMutation.isPending || fineTuneEnabled) {
      return 'подготовка запущена'
    }

    return 'ожидание решения'
  }, [fineTuneEnabled, fineTuneMutation.isPending])

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
      setLogs((current) => [...current, 'Задача подготовки модели отправлена на бэкенд.'])
    } catch (error) {
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
      navigate('/modify')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  return (
    <>
      <PageFrame
        title="Подготовка модели"
        description="На этом шаге можно заранее подготовить базовые веса диффузионной модели или сразу перейти к модификации и позволить системе догрузить их лениво."
        aside={<FineTuneAside statusLabel={statusLabel} />}
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
              Подготовить базовые веса
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

        {fineTuneMutation.isPending || fineTuneEnabled ? (
          <div className="upload-stage__loading">
            <Spinner label="Бэкенд готовит базовые веса и транслирует статусы через WebSocket." tone="diffusion" />
          </div>
        ) : null}

        <TrainingLogPanel
          emptyLabel="Логи подготовки появятся здесь после старта задачи."
          logs={logs}
          title="Поток логов подготовки"
        />
      </PageFrame>

      <Modal
        onClose={() => setErrorMessage(null)}
        open={Boolean(errorMessage)}
        title="Ошибка подготовки модели"
        tone="error"
      >
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>
    </>
  )
}

function FineTuneAside({ statusLabel }: { statusLabel: string }) {
  return (
    <div className="info-card">
      <p className="info-card__text">
        Канал логов: <strong>WebSocket</strong>
      </p>
      <p className="info-card__text">
        Восстановление состояния: <strong>включено</strong>
      </p>
      <p className="info-card__text">
        Текущий статус: <strong>{statusLabel}</strong>
      </p>
    </div>
  )
}
