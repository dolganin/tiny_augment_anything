import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adaptMetricVersions, adaptMetrics } from '@/shared/api/adapters'
import { useMetricsQuery, useMetricVersionsQuery, useTaskStatusQuery } from '@/shared/api/workflow.hooks'
import { useWorkflowSocket } from '@/shared/api/workflow.socket'
import { TrainingLogPanel } from '@/features/fine-tune-training/TrainingLogPanel'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { type DatasetMetricVersion } from '@/shared/types/workflow'
import { useSessionStore } from '@/store/session/session.store'
import { MetricsChart } from '@/features/classifier-metrics/MetricsChart'
import { Button } from '@/shared/ui/buttons/Button'

export function MetricsPage() {
  const navigate = useNavigate()
  const metrics = useSessionStore((state) => state.metrics)
  const classifierJobId = useSessionStore((state) => state.classifierJobId)
  const classifierLogs = useSessionStore((state) => state.classifierLogs)
  const workflowStage = useSessionStore((state) => state.workflowStage)
  const setSession = useSessionStore((state) => state.setSession)
  const sessionId = useSessionStore((state) => state.sessionId)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const taskSnapshotRef = useRef<string | null>(null)
  const metricVersionsQuery = useMetricVersionsQuery(sessionId)
  const metricsQuery = useMetricsQuery(classifierJobId ? null : sessionId, selectedVersionId)
  const taskStatusQuery = useTaskStatusQuery(sessionId, classifierJobId)

  useEffect(() => {
    setSession({ workflowStage: 'metrics' })
  }, [setSession])

  useEffect(() => {
    taskSnapshotRef.current = null
  }, [classifierJobId])

  const metricVersions = useMemo<DatasetMetricVersion[]>(
    () => (metricVersionsQuery.data ? adaptMetricVersions(metricVersionsQuery.data) : []),
    [metricVersionsQuery.data],
  )

  useEffect(() => {
    if (metricVersions.length === 0) {
      setSelectedVersionId(null)
      return
    }
    const selectedStillExists = selectedVersionId
      ? metricVersions.some((item) => item.datasetVersionId === selectedVersionId)
      : false
    if (selectedStillExists) {
      return
    }
    const preferredVersion =
      metricVersions.find((item) => item.isActive) ??
      metricVersions.find((item) => item.hasMetrics) ??
      metricVersions[0]
    setSelectedVersionId(preferredVersion.datasetVersionId)
  }, [metricVersions, selectedVersionId])

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
    if (!metricsQuery.data || metricsQuery.data.ready === false) {
      return
    }
    setSession({ metrics: adaptMetrics(metricsQuery.data) })
  }, [metricsQuery.data, setSession])

  useEffect(() => {
    if (!metricsQuery.error && !metricVersionsQuery.error) {
      return
    }
    setErrorMessage(getErrorMessage(metricsQuery.error ?? metricVersionsQuery.error))
  }, [metricVersionsQuery.error, metricsQuery.error])

  const visibleMetrics = useMemo(
    () => (metricsQuery.data && metricsQuery.data.ready !== false ? adaptMetrics(metricsQuery.data) : { precision: [], recall: [] }),
    [metricsQuery.data],
  )
  const metricsReady = metricsQuery.data?.ready !== false
  const selectedVersion = useMemo(
    () => metricVersions.find((item) => item.datasetVersionId === selectedVersionId) ?? null,
    [metricVersions, selectedVersionId],
  )
  const hasClassifierState =
    Boolean(classifierJobId) || classifierLogs.length > 0 || Boolean(metrics) || workflowStage === 'metrics'
  const isTrainingActive =
    Boolean(classifierJobId) ||
    taskStatusQuery.data?.status === 'pending' ||
    taskStatusQuery.data?.status === 'running'
  const isStaleTrainingState = !isTrainingActive && !metricsReady && hasClassifierState

  const resetClassifierState = () => {
    setSession({
      classifierJobId: null,
      classifierLogs: [],
      metrics: null,
      workflowStage: 'classifier-train',
    })
    setErrorMessage(null)
    navigate('/classifier/train')
  }

  return (
    <>
      <PageFrame
        description=""
        title="Метрики по классам"
      >
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
            <div className="generation-form__actions">
              <Button onClick={resetClassifierState} type="button" variant="secondary">
                Сбросить обучение
              </Button>
            </div>
          </>
        ) : null}

        {isStaleTrainingState ? (
          <div className="upload-stage">
            <p className="upload-stage__status">
              Активная задача обучения не найдена, а метрики ещё не готовы. Скорее всего, состояние классификатора зависло после перезапуска.
            </p>
            <div className="generation-form__actions">
              <Button onClick={resetClassifierState} type="button" variant="secondary">
                Сбросить обучение
              </Button>
            </div>
          </div>
        ) : null}

        {!isTrainingActive && metricsQuery.isLoading ? (
          <div className="upload-stage__loading">
            <Spinner label="Загружаю метрики валидации по классам." />
          </div>
        ) : null}

        {!isTrainingActive && !isStaleTrainingState && !metricsQuery.isLoading ? (
          <div className="metrics-layout">
            <aside className="metrics-versions">
              <h3 className="metrics-versions__title">Версии датасета</h3>
              <div className="metrics-versions__list">
                {metricVersions.map((version) => (
                  <button
                    className={`metrics-versions__item${version.datasetVersionId === selectedVersionId ? ' metrics-versions__item--active' : ''}`}
                    key={version.datasetVersionId}
                    onClick={() => setSelectedVersionId(version.datasetVersionId)}
                    type="button"
                  >
                    <span className="metrics-versions__index">v{version.versionIndex}</span>
                    <span className="metrics-versions__meta">
                      {version.hasMetrics ? 'Есть метрики' : 'Без метрик'}
                      {version.isActive ? ' · активная' : ''}
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <div className="metrics-content">
              <div className="info-card">
                <p className="info-card__text">
                  {selectedVersion
                    ? `Показаны метрики для версии v${selectedVersion.versionIndex}.`
                    : 'Выбери версию датасета, чтобы посмотреть её метрики.'}
                </p>
              </div>
              {metricsReady ? (
                <div className="metrics-grid">
                  <MetricsChart items={visibleMetrics.recall} title="Recall" tone="recall" />
                  <MetricsChart items={visibleMetrics.precision} title="Precision" tone="precision" />
                </div>
              ) : (
                <div className="upload-stage">
                  <p className="upload-stage__status">
                    Для выбранной версии датасета метрики ещё не рассчитаны.
                  </p>
                </div>
              )}
            </div>
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
