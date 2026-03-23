import { useEffect, useMemo, useState } from 'react'
import { adaptMetrics } from '@/shared/api/adapters'
import { useMetricsQuery } from '@/shared/api/workflow.hooks'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { useSessionStore } from '@/store/session/session.store'
import { MetricsChart } from '@/features/classifier-metrics/MetricsChart'

export function MetricsPage() {
  const metrics = useSessionStore((state) => state.metrics)
  const setSession = useSessionStore((state) => state.setSession)
  const sessionId = useSessionStore((state) => state.sessionId)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const metricsQuery = useMetricsQuery(sessionId)

  useEffect(() => {
    setSession({ workflowStage: 'metrics' })
  }, [setSession])

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

  return (
    <>
      <PageFrame title="Метрики по классам">
        {metricsQuery.isLoading ? (
          <div className="upload-stage__loading">
            <Spinner label="Загружаю метрики валидации по классам." />
          </div>
        ) : null}

        {!metricsQuery.isLoading ? (
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
