import { ReviewBatchActions } from '@/features/generation-review/ReviewBatchActions'
import { ReviewGalleryGrid } from '@/features/generation-review/ReviewGalleryGrid'
import { ReviewGalleryItem } from '@/features/generation-review/ReviewImageCard'
import { ReviewImageLightbox } from '@/features/generation-review/ReviewImageLightbox'
import { Button } from '@/shared/ui/buttons/Button'
import '@/features/generation-review/review-gallery-modal.css'

type ReviewGalleryModalProps = {
  approvedCount: number
  classRemainingItems: Array<{ className: string; remaining: number }>
  currentLightboxIndex: number
  disableRejectAll: boolean
  disableSave: boolean
  disableStartClassifier: boolean
  isMutating: boolean
  items: ReviewGalleryItem[]
  lightboxItem: ReviewGalleryItem | null
  onApprove: (item: ReviewGalleryItem) => void
  onClose: () => void
  onCloseLightbox: () => void
  onOpenLightbox: (itemId: string) => void
  onReject: (item: ReviewGalleryItem) => void
  onRejectAll: () => void
  onSaveToDataset: () => void
  onStartClassifier: () => void
  onMoveLightbox: (direction: -1 | 1) => void
  open: boolean
}

export function ReviewGalleryModal({
  approvedCount,
  classRemainingItems,
  currentLightboxIndex,
  disableRejectAll,
  disableSave,
  disableStartClassifier,
  isMutating,
  items,
  lightboxItem,
  onApprove,
  onClose,
  onCloseLightbox,
  onOpenLightbox,
  onReject,
  onRejectAll,
  onSaveToDataset,
  onStartClassifier,
  onMoveLightbox,
  open,
}: ReviewGalleryModalProps) {
  if (!open) {
    return null
  }

  return (
    <div className="review-gallery-modal-layer" role="presentation">
      <div className="review-gallery-modal-backdrop" onClick={onClose} />
      <section aria-modal="true" className="review-gallery-modal" role="dialog">
        <header className="review-gallery-modal__header">
          <div>
            <p className="review-gallery-modal__eyebrow">Отбор синтетических результатов</p>
            <h2 className="review-gallery-modal__title">Галерея текущей партии</h2>
            {classRemainingItems.length > 0 ? (
              <div className="review-gallery-modal__class-remaining">
                {classRemainingItems.map((item) => (
                  <span key={item.className}>
                    {item.className}: осталось {item.remaining}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="review-gallery-modal__header-meta">
            <span>Подтверждено {approvedCount}</span>
            <span>Всего {items.length}</span>
          </div>
          <Button onClick={onClose} type="button" variant="ghost">
            Закрыть
          </Button>
        </header>

        <ReviewGalleryGrid
          disabled={isMutating}
          items={items}
          onApprove={onApprove}
          onOpen={onOpenLightbox}
          onReject={onReject}
        />

        <ReviewBatchActions
          approvedCount={approvedCount}
          disableRejectAll={disableRejectAll}
          disableSave={disableSave}
          disableStartClassifier={disableStartClassifier}
          onClose={onClose}
          onRejectAll={onRejectAll}
          onSaveToDataset={onSaveToDataset}
          onStartClassifier={onStartClassifier}
        />
      </section>

      <ReviewImageLightbox
        currentIndex={currentLightboxIndex}
        disabled={isMutating}
        item={lightboxItem}
        onApprove={onApprove}
        onClose={onCloseLightbox}
        onMove={onMoveLightbox}
        onReject={onReject}
        total={items.length}
      />
    </div>
  )
}
