import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkflowSocket } from '@/shared/api/workflow.socket'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { useSessionStore } from '@/store/session/session.store'
import { TrainingLogPanel } from '@/features/fine-tune-training/TrainingLogPanel'

export function ClassifierTrainPage() {
  const navigate = useNavigate()
  const sessionId = useSessionStore((state) => state.sessionId)
  const classifierJobId = useSessionStore((state) => state.classifierJobId)
  const setSession = useSessionStore((state) => state.setSession)
  const [logs, setLogs] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setSession({ workflowStage: 'classifier-train' })
  }, [setSession])

  useWorkflowSocket({
    sessionId,
    onError: () => setErrorMessage('Канал логов классификатора недоступен.'),
    onMessage: (event) => {
      if (event.jobId && classifierJobId && event.jobId !== classifierJobId) {
        return
      }

      if (event.type === 'classifier.progress') {
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

      if (event.type === 'task.completed' && classifierJobId && event.jobId === classifierJobId) {
        setSession({ workflowStage: 'metrics' })
        navigate('/metrics')
      }

      if (event.type === 'task.failed' && classifierJobId && event.jobId === classifierJobId) {
        setErrorMessage(event.payload.message ?? 'Обучение классификатора завершилось с ошибкой.')
      }
    },
  })

  const statusLabel = useMemo(() => {
    if (classifierJobId) {
      return 'идёт обучение'
    }

    return 'ожидание запуска'
  }, [classifierJobId])

  return (
    <>
      <PageFrame
        title="Обучение классификатора"
        description="После подтверждения новых изображений запускается backend hook обучения. Интерфейс показывает поток логов и ждёт завершения."
        aside={<ClassifierAside statusLabel={statusLabel} />}
      >
        <div className="upload-stage__loading">
          <Spinner
            label="Классификатор обучается. После завершения откроется экран метрик."
            tone="diffusion"
          />
        </div>

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

function ClassifierAside({ statusLabel }: { statusLabel: string }) {
  return (
    <div className="info-card">
      <p className="info-card__text">
        Канал логов: <strong>WebSocket</strong>
      </p>
      <p className="info-card__text">
        Статус обучения: <strong>{statusLabel}</strong>
      </p>
    </div>
  )
}
