import { Button } from '@/shared/ui/buttons/Button'
import { GenerationAsset } from '@/shared/types/workflow'

export type ReviewItemStatus = 'pending' | 'approved' | 'rejected'

export type ReviewGalleryItem = GenerationAsset & {
  status: ReviewItemStatus
}

type ReviewImageCardProps = {
  disabled?: boolean
  item: ReviewGalleryItem
  onApprove: (item: ReviewGalleryItem) => void
  onOpen: (itemId: string) => void
  onReject: (item: ReviewGalleryItem) => void
}

export function ReviewImageCard({
  disabled = false,
  item,
  onApprove,
  onOpen,
  onReject,
}: ReviewImageCardProps) {
  return (
    <article className={`review-gallery-card review-gallery-card--${item.status}`}>
      <button
        className="review-gallery-card__preview"
        onClick={() => onOpen(item.id)}
        type="button"
      >
        <img alt={`Синтетический результат для класса ${item.className}`} src={item.previewUrl} />
        <span className="review-gallery-card__class">{item.className}</span>
        <span className={`review-gallery-card__status review-gallery-card__status--${item.status}`}>
          {item.status === 'approved' ? 'Принято' : item.status === 'rejected' ? 'Отклонено' : 'Ожидает'}
        </span>
      </button>

      <div className="review-gallery-card__actions">
        <Button
          disabled={disabled || item.status === 'approved'}
          onClick={() => onApprove(item)}
          type="button"
        >
          ✓
        </Button>
        <Button
          disabled={disabled || item.status === 'rejected'}
          onClick={() => onReject(item)}
          type="button"
          variant="danger"
        >
          ✗
        </Button>
      </div>
    </article>
  )
}
