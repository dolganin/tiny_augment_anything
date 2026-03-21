import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adaptDatasetStats } from '@/shared/api/adapters'
import {
  useDatasetStatsQuery,
  useSelectedClassesMutation,
} from '@/shared/api/workflow.hooks'
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { useSessionStore } from '@/store/session/session.store'
import { ClassDistributionChart } from '@/features/dataset-stats/ClassDistributionChart'
import { ClassSelectionPanel } from '@/features/class-selection/ClassSelectionPanel'
import '@/features/dataset-stats/dataset-stats.css'

export function DatasetStatsPage() {
  const navigate = useNavigate()
  const sessionId = useSessionStore((state) => state.sessionId)
  const datasetName = useSessionStore((state) => state.datasetName)
  const datasetStats = useSessionStore((state) => state.datasetStats)
  const selectedClasses = useSessionStore((state) => state.selectedClasses)
  const setSession = useSessionStore((state) => state.setSession)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const statsQuery = useDatasetStatsQuery(sessionId)
  const selectedClassesMutation = useSelectedClassesMutation(sessionId ?? '')

  useEffect(() => {
    setSession({ workflowStage: 'dataset-stats' })
  }, [setSession])

  useEffect(() => {
    if (!statsQuery.data) {
      return
    }
    setSession({ datasetStats: adaptDatasetStats(statsQuery.data) })
  }, [setSession, statsQuery.data])

  useEffect(() => {
    if (!statsQuery.error) {
      return
    }
    setErrorMessage(getErrorMessage(statsQuery.error))
  }, [statsQuery.error])

  const visibleStats = useMemo(() => datasetStats.slice(0, 10), [datasetStats])

  const toggleClass = (className: string) => {
    const nextSelection = selectedClasses.includes(className)
      ? selectedClasses.filter((item) => item !== className)
      : [...selectedClasses, className]
    setSession({ selectedClasses: nextSelection })
  }

  const handleContinue = async () => {
    if (!sessionId || selectedClasses.length === 0) {
      return
    }
    try {
      await selectedClassesMutation.mutateAsync(selectedClasses)
      setSession({ workflowStage: 'fine-tune' })
      navigate('/diffusion/fine-tune')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  return (
    <>
      <PageFrame
        title="Статистика классов"
        description="Проверь редкие классы, выбери нужные категории и переходи к следующему этапу аугментации."
      >
        <div className="dataset-stats__summary">
          <div className="dataset-stats__summary-card">
            <span className="dataset-stats__summary-label">Датасет</span>
            <strong className="dataset-stats__summary-value">{datasetName ?? 'Без имени'}</strong>
          </div>
          <div className="dataset-stats__summary-card">
            <span className="dataset-stats__summary-label">Классов всего</span>
            <strong className="dataset-stats__summary-value">{datasetStats.length}</strong>
          </div>
          <div className="dataset-stats__summary-card">
            <span className="dataset-stats__summary-label">В интерфейсе</span>
            <strong className="dataset-stats__summary-value">{visibleStats.length} самых редких</strong>
          </div>
        </div>

        {statsQuery.isLoading ? (
          <div className="upload-stage__loading">
            <Spinner label="Загружаю распределение классов." />
          </div>
        ) : null}

        {!statsQuery.isLoading && visibleStats.length > 0 ? (
          <div className="dataset-stats__layout">
            <section className="info-card dataset-stats__chart-card">
              <div className="dataset-stats__section-head">
                <h3 className="dataset-stats__section-title">Распределение по классам</h3>
                <p className="dataset-stats__section-copy">Первые 10 классов после сортировки по редкости.</p>
              </div>
              <ClassDistributionChart items={visibleStats} />
            </section>

            <section className="info-card dataset-stats__selection-card">
              <div className="dataset-stats__section-head">
                <h3 className="dataset-stats__section-title">Выбор классов</h3>
                <p className="dataset-stats__section-copy">Отметь классы, для которых нужно увеличить датасет.</p>
              </div>
              <ClassSelectionPanel
                items={visibleStats}
                onToggle={toggleClass}
                selectedClasses={selectedClasses}
              />
            </section>
          </div>
        ) : null}

        {!statsQuery.isLoading && visibleStats.length === 0 ? (
          <div className="info-card">
            <p className="info-card__text">Бэкенд не вернул статистику классов для текущего датасета.</p>
          </div>
        ) : null}

        <div className="class-selection__footer">
          <Button onClick={() => navigate('/upload')} variant="ghost">
            Назад
          </Button>
          <Button
            disabled={selectedClasses.length === 0 || selectedClassesMutation.isPending}
            onClick={handleContinue}
          >
            Перейти к дообучению
          </Button>
        </div>
      </PageFrame>

      <Modal
        onClose={() => setErrorMessage(null)}
        open={Boolean(errorMessage)}
        title="Ошибка при выборе классов"
        tone="error"
      >
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>
    </>
  )
}
