import { Button } from '@/shared/ui/buttons/Button'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { type UploadedClassifierWeights } from '@/shared/types/workflow'

type SplitSummary = {
  classCount: number
  trainCount: number
  valCount: number
  perClass: Array<{
    className: string
    originalCount: number
    syntheticCount: number
    trainCount: number
    valCount: number
  }>
  error: string | null
}

type ClassifierSplitSummaryCardProps = {
  isLoading: boolean
  split: SplitSummary | null
}

export function ClassifierSplitSummaryCard({ isLoading, split }: ClassifierSplitSummaryCardProps) {
  return (
    <section className="info-card classifier-train-layout__full classifier-summary-card">
      <div className="classifier-summary-card__head">
        <h3 className="classifier-summary-card__title">Разбиение train / val</h3>
        {isLoading ? <Spinner label="Считаю layout датасета" /> : null}
      </div>
      {split?.error ? (
        <p className="info-card__text">{split.error}</p>
      ) : (
        <>
          <div className="classifier-summary-card__totals">
            <span>Классов: {split?.classCount ?? 0}</span>
            <span>Train: {split?.trainCount ?? 0}</span>
            <span>Val: {split?.valCount ?? 0}</span>
          </div>
          <div className="classifier-split-table">
            <div className="classifier-split-table__row classifier-split-table__row--head">
              <span>Класс</span>
              <span>Original</span>
              <span>Synth</span>
              <span>Train</span>
              <span>Val</span>
            </div>
            {(split?.perClass ?? []).map((item) => (
              <div className="classifier-split-table__row" key={item.className}>
                <span>{item.className}</span>
                <span>{item.originalCount}</span>
                <span>{item.syntheticCount}</span>
                <span>{item.trainCount}</span>
                <span>{item.valCount}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

type ClassifierModelHistoryProps = {
  selectedWeightsPath: string | null
  weights: UploadedClassifierWeights[]
  onWeightsApply: (weights: UploadedClassifierWeights) => void
}

export function ClassifierModelHistory({ selectedWeightsPath, weights, onWeightsApply }: ClassifierModelHistoryProps) {
  const latestWeights = weights[0] ?? null
  const isSelected = latestWeights?.weightsPath === selectedWeightsPath

  return (
    <section className="info-card classifier-train-layout__full classifier-model-history">
      <div className="classifier-summary-card__head">
        <h3 className="classifier-summary-card__title">Модель валидации датасета</h3>
      </div>
      {!latestWeights ? (
        <p className="info-card__text">Для текущего датасета ещё не загружено ни одних classifier-весов.</p>
      ) : (
        <div className="classifier-model-history__list">
          <article
            className={`classifier-model-card${isSelected ? ' classifier-model-card--selected' : ''}`}
            key={latestWeights.weightsPath}
          >
            <div className="classifier-model-card__meta">
              <strong>{latestWeights.displayName}</strong>
              {isSelected ? <span className="classifier-model-card__badge">Выбрано</span> : null}
            </div>
            <p className="classifier-model-card__line">
              Файл: {latestWeights.fileName}
            </p>
            <p className="classifier-model-card__line">
              Размер: {formatFileSize(latestWeights.sizeBytes)}
            </p>
            <p className="classifier-model-card__line">
              Загружено: {new Date(latestWeights.updatedAt).toLocaleString('ru-RU')}
            </p>
            <div className="classifier-model-card__actions">
              <Button
                onClick={() => onWeightsApply(latestWeights)}
                type="button"
                variant="ghost"
              >
                {isSelected ? 'Используется' : 'Использовать'}
              </Button>
            </div>
          </article>
        </div>
      )}
    </section>
  )
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}
