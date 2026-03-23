import { useEffect, useMemo, useRef, useState } from 'react'
import { adaptMetrics } from '@/shared/api/adapters'
import { useMetricsQuery, useTaskStatusQuery } from '@/shared/api/workflow.hooks'
import { useWorkflowSocket } from '@/shared/api/workflow.socket'
import { TrainingLogPanel } from '@/features/fine-tune-training/TrainingLogPanel'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { useSessionStore } from '@/store/session/session.store'
import { MetricsChart } from '@/features/classifier-metrics/MetricsChart'

export function MetricsPage() {
  const metrics = useSessionStore((state) => state.metrics)
  const classifierJobId = useSessionStore((state) => state.classifierJobId)
  const classifierLogs = useSessionStore((state) => state.classifierLogs)
  const setSession = useSessionStore((state) => state.setSession)
  const sessionId = useSessionStore((state) => state.sessionId)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const taskSnapshotRef = useRef<string | null>(null)
  const metricsQuery = useMetricsQuery(classifierJobId ? null : sessionId)
  const taskStatusQuery = useTaskStatusQuery(sessionId, classifierJobId)

  useEffect(() => {
    setSession({ workflowStage: 'metrics' })
  }, [setSession])

  useEffect(() => {
    taskSnapshotRef.current = null
  }, [classifierJobId])

  const appendLog = (line: string) => {
    const currentLogs = useSessionStore.getState().classifierLogs
    if (line.startsWith('WebSocket недоступен') && currentLogs.includes(line)) {
      return
    }
    setSession({ classifierLogs: [...currentLogs, line] })
  }

  useWorkflowSocket({
    sessionId,
    onError: () => {
      if (!classifierJobId) {
        return
      }
      appendLog('WebSocket недоступен, продолжаю через polling статуса задачи.')
    },
    onMessage: (event) => {
      if (!classifierJobId || (event.jobId && event.jobId !== classifierJobId)) {
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
      if (event.type === 'task.completed' && event.jobId === classifierJobId) {
        setSession({ classifierJobId: null })
      }
      if (event.type === 'task.failed' && event.jobId === classifierJobId) {
        appendLog(`Ошибка: ${event.payload.message ?? 'Обучение классификатора завершилось с ошибкой.'}`)
        setSession({ classifierJobId: null })
        setErrorMessage(event.payload.message ?? 'Обучение классификатора завершилось с ошибкой.')
      }
    },
  })

  useEffect(() => {
    if (!taskStatusQuery.error || !classifierJobId) {
      return
    }
    appendLog(`Ошибка polling: ${getErrorMessage(taskStatusQuery.error)}`)
    setSession({ classifierJobId: null })
    setErrorMessage(getErrorMessage(taskStatusQuery.error))
  }, [classifierJobId, setSession, taskStatusQuery.error])

  useEffect(() => {
    if (!classifierJobId || !taskStatusQuery.data) {
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
      setSession({ classifierJobId: null })
      return
    }

    if (status === 'error' || status === 'cancelled') {
      appendLog(`Ошибка: ${resolvedMessage ?? 'Обучение классификатора завершилось с ошибкой.'}`)
      setSession({ classifierJobId: null })
      setErrorMessage(resolvedMessage ?? 'Обучение классификатора завершилось с ошибкой.')
    }
  }, [classifierJobId, setSession, taskStatusQuery.data])

  useEffect(() => {
    if (!metricsQuery.data) {
      return
    }
    setSession({ metrics: adaptMetrics(metricsQuery.data) })
  }, [metricsQuery.data, setSession])

  useEffect(() => {
    if (!metricsQuery.error) {
      return
    }
    setErrorMessage(getErrorMessage(metricsQuery.error))
  }, [metricsQuery.error])

  const visibleMetrics = useMemo(() => metrics ?? { precision: [], recall: [] }, [metrics])
  const isTrainingActive =
    Boolean(classifierJobId) ||
    taskStatusQuery.data?.status === 'pending' ||
    taskStatusQuery.data?.status === 'running'

  return (
    <>
      <PageFrame title="Метрики по классам">
        {isTrainingActive ? (
          <>
            <div className="upload-stage__loading">
              <Spinner label="Классификатор обучается. Здесь появятся логи и затем метрики." tone="diffusion" />
            </div>

            <TrainingLogPanel
              emptyLabel="Логи классификатора появятся после первого сообщения от backend."
              logs={classifierLogs}
              title="Поток логов классификатора"
            />
          </>
        ) : null}

        {!isTrainingActive && metricsQuery.isLoading ? (
          <div className="upload-stage__loading">
            <Spinner label="Загружаю метрики валидации по классам." />
          </div>
        ) : null}

        {!isTrainingActive && !metricsQuery.isLoading ? (
          <div className="metrics-grid">
            <MetricsChart items={visibleMetrics.recall} title="Recall" tone="recall" />
            <MetricsChart items={visibleMetrics.precision} title="Precision" tone="precision" />
          </div>
        ) : null}
      </PageFrame>

      <Modal
        onClose={() => setErrorMessage(null)}
        open={Boolean(errorMessage)}
        title="Ошибка метрик"
        tone="error"
      >
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>
    </>
  )
}
