import '@/features/generation-review/review.css'
import { GenerationAsset } from '@/shared/types/workflow'

type ReviewQueueProps = {
  asset: GenerationAsset | null
  approvedCount: number
  pendingCount: number
}

export function ReviewQueue({ asset, approvedCount, pendingCount }: ReviewQueueProps) {
  if (!asset) {
    return (
      <section className="review-card">
        <p className="review-card__empty">Сейчас в очереди нет изображений для проверки.</p>
      </section>
    )
  }

  return (
    <section className="review-card">
      <img alt={`Результат для класса ${asset.className}`} className="review-card__image" src={asset.previewUrl} />
      <div className="review-card__meta">
        <span>Класс: {asset.className}</span>
        <span>Подтверждено: {approvedCount}</span>
        <span>В очереди: {pendingCount}</span>
      </div>
    </section>
  )
}
