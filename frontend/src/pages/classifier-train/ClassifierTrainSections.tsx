import { Button } from '@/shared/ui/buttons/Button'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { type TrainedClassifierModel } from '@/shared/types/workflow'

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
  models: TrainedClassifierModel[]
  onModelApply: (model: TrainedClassifierModel) => void
}

export function ClassifierModelHistory({ models, onModelApply }: ClassifierModelHistoryProps) {
  return (
    <section className="info-card classifier-train-layout__full classifier-model-history">
      <div className="classifier-summary-card__head">
        <h3 className="classifier-summary-card__title">Сохранённые модели датасета</h3>
      </div>
      {models.length === 0 ? (
        <p className="info-card__text">Для этого датасета ещё не сохранено ни одной конфигурации классификатора.</p>
      ) : (
        <div className="classifier-model-history__list">
          {models.map((model) => (
            <article className="classifier-model-card" key={model.id}>
              <div className="classifier-model-card__meta">
                <strong>{model.modelKey ?? 'Classifier run'}</strong>
                <span>{model.status}</span>
              </div>
              <p className="classifier-model-card__line">
                Классы: {model.classNames.length > 0 ? model.classNames.join(', ') : 'не сохранены'}
              </p>
              <p className="classifier-model-card__line">
                Веса: {(model.pretrainedWeightsPath ?? 'нет').split('/').pop()}
              </p>
              <p className="classifier-model-card__line">
                Batch train/val: {Number(model.hparams.train_batch_size ?? 32)} / {Number(model.hparams.val_batch_size ?? 64)}
              </p>
              <div className="classifier-model-card__actions">
                <Button
                  disabled={!model.pretrainedWeightsPath}
                  onClick={() => onModelApply(model)}
                  type="button"
                  variant="ghost"
                >
                  Использовать
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
