import { Button } from '@/shared/ui/buttons/Button'
import { ReviewGalleryItem } from '@/features/generation-review/ReviewImageCard'

type ReviewImageLightboxProps = {
  currentIndex: number
  disabled?: boolean
  item: ReviewGalleryItem | null
  onApprove: (item: ReviewGalleryItem) => void
  onClose: () => void
  onMove: (direction: -1 | 1) => void
  onReject: (item: ReviewGalleryItem) => void
  total: number
}

export function ReviewImageLightbox({
  currentIndex,
  disabled = false,
  item,
  onApprove,
  onClose,
  onMove,
  onReject,
  total,
}: ReviewImageLightboxProps) {
  if (!item) {
    return null
  }

  return (
    <div className="review-lightbox" role="presentation">
      <div className="review-lightbox__backdrop" onClick={onClose} />
      <section aria-modal="true" className="review-lightbox__dialog" role="dialog">
        <button className="review-lightbox__close" onClick={onClose} type="button">
          ×
        </button>

        <button className="review-lightbox__nav review-lightbox__nav--prev" onClick={() => onMove(-1)} type="button">
          ←
        </button>
        <button className="review-lightbox__nav review-lightbox__nav--next" onClick={() => onMove(1)} type="button">
          →
        </button>

        <div className="review-lightbox__media">
          <img alt={`Детальный просмотр результата ${item.className}`} src={item.previewUrl} />
        </div>

        <aside className="review-lightbox__sidebar">
          <div className="review-lightbox__head">
            <span className="review-lightbox__class">{item.className}</span>
            <span className={`review-lightbox__status review-lightbox__status--${item.status}`}>
              {item.status === 'approved' ? 'Принято' : item.status === 'rejected' ? 'Отклонено' : 'Ожидает'}
            </span>
          </div>

          <p className="review-lightbox__meta">
            {currentIndex + 1} / {total}
          </p>

          {item.referenceUrls.length > 0 ? (
            <div className="review-lightbox__samples">
              {item.referenceUrls.slice(0, 4).map((referenceUrl, index) => (
                <img
                  alt={`Образец класса ${item.className} ${index + 1}`}
                  key={`${item.id}-${referenceUrl}-${index}`}
                  loading="lazy"
                  src={referenceUrl}
                />
              ))}
            </div>
          ) : null}

          <div className="review-lightbox__actions">
            <Button disabled={disabled || item.status === 'approved'} onClick={() => onApprove(item)} type="button">
              Принять
            </Button>
            <Button
              disabled={disabled || item.status === 'rejected'}
              onClick={() => onReject(item)}
              type="button"
              variant="danger"
            >
              Отклонить
            </Button>
            <Button onClick={onClose} type="button" variant="ghost">
              Закрыть
            </Button>
          </div>
        </aside>
      </section>
    </div>
  )
}
