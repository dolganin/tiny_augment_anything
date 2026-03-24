import { Button } from '@/shared/ui/buttons/Button'

type ReviewBatchActionsProps = {
  approvedCount: number
  disableSave: boolean
  disableStartClassifier: boolean
  disableRejectAll: boolean
  onClose: () => void
  onRejectAll: () => void
  onSaveToDataset: () => void
  onStartClassifier: () => void
}

export function ReviewBatchActions({
  approvedCount,
  disableSave,
  disableStartClassifier,
  disableRejectAll,
  onClose,
  onRejectAll,
  onSaveToDataset,
  onStartClassifier,
}: ReviewBatchActionsProps) {
  return (
    <div className="review-gallery-modal__footer">
      <div className="review-gallery-modal__footer-meta">
        <span>Подтверждено {approvedCount}</span>
      </div>
      <div className="review-gallery-modal__footer-actions">
        <Button disabled={disableRejectAll} onClick={onRejectAll} type="button" variant="danger">
          Отклонить всё
        </Button>
        <Button disabled={disableSave} onClick={onSaveToDataset} type="button" variant="secondary">
          Залить в датасет
        </Button>
        <Button disabled={disableStartClassifier} onClick={onStartClassifier} type="button">
          К классификатору
        </Button>
        <Button onClick={onClose} type="button" variant="ghost">
          Закрыть
        </Button>
      </div>
    </div>
  )
}
