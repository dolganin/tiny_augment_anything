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
        description="Бэкенд уже отсортировал классы по редкости. На этом шаге выбираются классы, для которых будет наращиваться датасет."
        aside={<StatsAside datasetName={datasetName} totalClasses={datasetStats.length} />}
      >
        {statsQuery.isLoading ? (
          <div className="upload-stage__loading">
            <Spinner label="Загружаю распределение классов и собираю редкие категории." />
          </div>
        ) : null}

        {!statsQuery.isLoading && visibleStats.length > 0 ? (
          <div className="info-card">
            <ClassDistributionChart items={visibleStats} />
            <ClassSelectionPanel
              items={visibleStats}
              onToggle={toggleClass}
              selectedClasses={selectedClasses}
            />
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

function StatsAside({
  datasetName,
  totalClasses,
}: {
  datasetName: string | null
  totalClasses: number
}) {
  return (
    <div className="info-card">
      <p className="info-card__text">
        Датасет: <strong>{datasetName ?? 'без имени'}</strong>
      </p>
      <p className="info-card__text">
        Всего классов в ответе: <strong>{totalClasses}</strong>
      </p>
      <p className="info-card__text">
        Для интерфейса показываются только первые 10 элементов отсортированного списка.
      </p>
    </div>
  )
}
