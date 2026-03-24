import { useMemo } from 'react'
import { useBatchModificationSourcesQuery, useLatestAugmentationRunQuery } from '@/shared/api/workflow.hooks'

type BatchProgressPanelProps = {
  sessionId: string | null
  sourceLabelById: Record<string, string>
}

export function BatchProgressPanel({ sessionId, sourceLabelById }: BatchProgressPanelProps) {
  const latestRunQuery = useLatestAugmentationRunQuery(sessionId)
  const runId = latestRunQuery.data?.isBatch ? latestRunQuery.data.runId : null
  const sourcesQuery = useBatchModificationSourcesQuery(sessionId, runId)

  const items = sourcesQuery.data?.items ?? []
  const summary = useMemo(() => {
    const total = items.length
    const completed = items.filter((item) => item.status === 'completed').length
    const failed = items.filter((item) => item.status === 'failed').length
    const processing = items.filter((item) => item.status === 'processing').length
    const pending = items.filter((item) => item.status === 'pending').length
    return { total, completed, failed, processing, pending }
  }, [items])

  if (!latestRunQuery.data?.runId || !latestRunQuery.data.isBatch || summary.total === 0) {
    return null
  }

  const percent = Math.round(((summary.completed + summary.failed) / summary.total) * 100)

  return (
    <section className="info-card batch-progress-panel">
      <div className="batch-progress-panel__head">
        <div>
          <strong>Прогресс batch-модификации</strong>
          <p className="info-card__text">
            Run {latestRunQuery.data.runId}. Режим: {latestRunQuery.data.batchMode === 'custom_masks' ? 'индивидуальные маски' : 'общая маска'}.
          </p>
        </div>
        <div className="batch-progress-panel__summary">
          <span>{percent}% завершено</span>
          <span>{summary.completed} ok</span>
          <span>{summary.failed} failed</span>
        </div>
      </div>

      <div className="batch-progress-panel__bar" aria-hidden="true">
        <div className="batch-progress-panel__fill" style={{ width: `${percent}%` }} />
      </div>

      <div className="batch-progress-panel__stats">
        <span>В очереди: {summary.pending}</span>
        <span>В работе: {summary.processing}</span>
        <span>Завершено: {summary.completed}</span>
        <span>С ошибкой: {summary.failed}</span>
      </div>

      <div className="batch-progress-panel__list">
        {items.map((item) => (
          <article className={`batch-progress-item batch-progress-item--${item.status}`} key={item.id}>
            <div className="batch-progress-item__title">
              <strong>{sourceLabelById[item.sourceAssetId] ?? `source ${item.position + 1}`}</strong>
              <span>{item.status}</span>
            </div>
            <div className="batch-progress-item__meta">
              <span>Позиция: {item.position + 1}</span>
              <span>Сгенерировано: {item.generatedCount}</span>
              {item.errorMessage ? <span>{item.errorMessage}</span> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
