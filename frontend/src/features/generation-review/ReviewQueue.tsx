import '@/features/generation-review/review.css'
import { GenerationAsset } from '@/shared/types/workflow'

type ReviewQueueProps = {
  asset: GenerationAsset | null
  approvedCount: number
  pendingCount: number
  onApprove: () => void
  onReject: () => void
  isMutating: boolean
}

export function ReviewQueue({ asset, approvedCount, pendingCount, onApprove, onReject, isMutating }: ReviewQueueProps) {
  if (!asset) {
    return (
      <section className="review-card">
        <p className="review-card__empty">Сейчас в очереди нет изображений для проверки.</p>
      </section>
    )
  }

  return (
    <div className="review-overlay" role="presentation">
      <div className="review-overlay__backdrop" />
      <section aria-modal="true" className="review-overlay__dialog" role="dialog">
        <div className="review-overlay__hero">
          <div className="review-overlay__head">
            <span className="review-overlay__class">{asset.className}</span>
            <div className="review-overlay__stats">
              <span>Подтверждено {approvedCount}</span>
              <span>В очереди {pendingCount}</span>
            </div>
          </div>
          <img alt={`Результат для класса ${asset.className}`} className="review-card__image" src={asset.previewUrl} />
        </div>

        {asset.referenceUrls.length > 0 ? (
          <div className="review-overlay__samples">
            {asset.referenceUrls.map((referenceUrl, index) => (
              <img
                alt={`Семпл класса ${asset.className} ${index + 1}`}
                className="review-overlay__sample"
                key={`${asset.id}-${referenceUrl}-${index}`}
                loading="lazy"
                src={referenceUrl}
              />
            ))}
          </div>
        ) : null}

        <div className="review-overlay__actions">
          <button className="button button--danger" disabled={isMutating} onClick={onReject} type="button">
            Отклонить
          </button>
          <button className="button button--primary" disabled={isMutating} onClick={onApprove} type="button">
            Принять
          </button>
        </div>
      </section>
    </div>
  )
}
