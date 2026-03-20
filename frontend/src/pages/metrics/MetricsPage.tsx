import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adaptDownload, adaptMetrics } from '@/shared/api/adapters'
import { useDownloadMutation, useMetricsQuery } from '@/shared/api/workflow.hooks'
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { useSessionStore } from '@/store/session/session.store'
import { MetricsChart } from '@/features/classifier-metrics/MetricsChart'

export function MetricsPage() {
  const navigate = useNavigate()
  const sessionId = useSessionStore((state) => state.sessionId)
  const metrics = useSessionStore((state) => state.metrics)
  const setSession = useSessionStore((state) => state.setSession)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const metricsQuery = useMetricsQuery(sessionId)
  const downloadMutation = useDownloadMutation(sessionId ?? '')

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

  const prepareDownload = async () => {
    if (!sessionId) {
      return
    }

    try {
      const response = await downloadMutation.mutateAsync()
      setSession({
        downloadUrl: adaptDownload(response.downloadPath),
        workflowStage: 'download',
      })
      navigate('/download')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  return (
    <>
      <PageFrame
        title="Метрики по классам"
        description="После обучения классификатора показываются Precision и Recall по каждому классу. Дальше можно подготовить итоговый архив к скачиванию."
      >
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

        <div className="class-selection__footer">
          <Button disabled={downloadMutation.isPending} onClick={prepareDownload}>
            Подготовить архив к скачиванию
          </Button>
        </div>
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
