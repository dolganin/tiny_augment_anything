import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStartFineTuneMutation } from '@/shared/api/workflow.hooks'
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

      if (event.type === 'task.completed') {
        setSession({
          fineTuneResolved: true,
          workflowStage: 'mode-select',
        })
        navigate('/mode')
      }

      if (event.type === 'task.failed') {
        setErrorMessage(event.payload.message ?? 'Бэкенд вернул ошибку во время дообучения.')
      }
    },
  })

  const statusLabel = useMemo(() => {
    if (fineTuneMutation.isPending || fineTuneEnabled) {
      return 'обучение запущено'
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
      setLogs((current) => [...current, 'Задача дообучения отправлена на бэкенд.'])
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const skipFineTune = () => {
    setSession({
      fineTuneEnabled: false,
      fineTuneResolved: true,
      fineTuneJobId: null,
      workflowStage: 'mode-select',
    })
    navigate('/mode')
  }

  return (
    <>
      <PageFrame
        title="Дообучение диффузионной модели"
        description="Этот шаг решает, будет ли выбранный набор классов использоваться для дополнительного обучения диффузионной модели перед следующими действиями."
        aside={<FineTuneAside statusLabel={statusLabel} />}
      >
        <div className="info-card">
          <p className="info-card__text">
            Если этот этап пропустить, интерфейс дальше откроет только режим модификации. Генерация по промпту останется недоступной.
          </p>
          <div className="class-selection__footer">
            <Button
              disabled={fineTuneMutation.isPending || fineTuneEnabled}
              onClick={startFineTune}
            >
              Запустить дообучение
            </Button>
            <Button disabled={fineTuneMutation.isPending || fineTuneEnabled} onClick={skipFineTune} variant="ghost">
              Пропустить этап
            </Button>
          </div>
        </div>

        {fineTuneMutation.isPending || fineTuneEnabled ? (
          <div className="upload-stage__loading">
            <Spinner label="Бэкенд дообучает модель и транслирует логи через WebSocket." tone="diffusion" />
          </div>
        ) : null}

        <TrainingLogPanel
          emptyLabel="Логи дообучения появятся здесь после старта задачи."
          logs={logs}
          title="Поток логов fine-tune"
        />
      </PageFrame>

      <Modal
        onClose={() => setErrorMessage(null)}
        open={Boolean(errorMessage)}
        title="Ошибка этапа fine-tune"
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
