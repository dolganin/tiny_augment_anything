import { ReviewGalleryItem, ReviewImageCard } from '@/features/generation-review/ReviewImageCard'

type ReviewGalleryGridProps = {
  disabled?: boolean
  items: ReviewGalleryItem[]
  onApprove: (item: ReviewGalleryItem) => void
  onOpen: (itemId: string) => void
  onReject: (item: ReviewGalleryItem) => void
}

export function ReviewGalleryGrid({
  disabled = false,
  items,
  onApprove,
  onOpen,
  onReject,
}: ReviewGalleryGridProps) {
  if (items.length === 0) {
    return (
      <div className="review-gallery-grid review-gallery-grid--empty">
        <div className="info-card">
          <p className="info-card__text">Текущая очередь review пуста. Можно закрыть окно или сохранить уже подтверждённые результаты в датасет.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="review-gallery-grid">
      {items.map((item) => (
        <ReviewImageCard
          disabled={disabled}
          item={item}
          key={item.id}
          onApprove={onApprove}
          onOpen={onOpen}
          onReject={onReject}
        />
      ))}
    </div>
  )
}
