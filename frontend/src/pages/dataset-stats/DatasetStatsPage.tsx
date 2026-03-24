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
import '@/features/dataset-stats/dataset-stats.css'

export function DatasetStatsPage() {
  const navigate = useNavigate()
  const sessionId = useSessionStore((state) => state.sessionId)
  const datasetName = useSessionStore((state) => state.datasetName)
  const datasetStats = useSessionStore((state) => state.datasetStats)
  const selectedClasses = useSessionStore((state) => state.selectedClasses)
  const selectedClassTargets = useSessionStore((state) => state.selectedClassTargets)
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
    const nextTargets = { ...selectedClassTargets }
    if (nextSelection.includes(className)) {
      nextTargets[className] = nextTargets[className] ?? 1
    } else {
      delete nextTargets[className]
    }
    setSession({ selectedClasses: nextSelection, selectedClassTargets: nextTargets })
  }

  const updateTarget = (className: string, value: number) => {
    setSession({
      selectedClassTargets: {
        ...selectedClassTargets,
        [className]: value,
      },
    })
  }

  const handleContinue = async () => {
    if (!sessionId || selectedClasses.length === 0) {
      return
    }
    try {
      const classTargets = Object.fromEntries(
        selectedClasses.map((className) => [className, selectedClassTargets[className] ?? 1]),
      )
      await selectedClassesMutation.mutateAsync({ classNames: selectedClasses, classTargets })
      setSession({ workflowStage: 'modify' })
      navigate('/modify')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const totalTargetCount = useMemo(
    () =>
      selectedClasses.reduce((acc, className) => acc + (selectedClassTargets[className] ?? 1), 0),
    [selectedClassTargets, selectedClasses],
  )

  return (
    <>
      <PageFrame
        description="Выбери классы для аугментации и задай целевое количество изображений для каждого из них."
        title="Статистика классов"
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
                <p className="dataset-stats__section-copy">
                  Нажми на строку графика, чтобы включить или исключить класс из аугментации.
                </p>
              </div>
              <ClassDistributionChart
                items={visibleStats}
                onToggle={toggleClass}
                onTargetChange={updateTarget}
                selectedClasses={selectedClasses}
                selectedClassTargets={selectedClassTargets}
              />
              <div className="class-selection__footer">
                <span className="class-selection__meta">Выбрано классов: {selectedClasses.length}</span>
                <span className="class-selection__meta">Целевых изображений: {totalTargetCount}</span>
              </div>
            </section>
          </div>
        ) : null}

        {!statsQuery.isLoading && visibleStats.length === 0 ? (
          <div className="info-card">
            <p className="info-card__text">Бэкенд не вернул статистику классов для текущего датасета.</p>
          </div>
        ) : null}

        <div className="class-selection__footer">
          <Button onClick={() => navigate('/datasets')} variant="ghost">
            Назад
          </Button>
          <Button
            disabled={selectedClasses.length === 0 || selectedClassesMutation.isPending}
            onClick={handleContinue}
          >
            Перейти к модификации
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
