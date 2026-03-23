import '@/features/generation-review/review.css'
import { Button } from '@/shared/ui/buttons/Button'
import { GenerationAsset } from '@/shared/types/workflow'

type ReviewQueueProps = {
  asset: GenerationAsset | null
  approvedCount: number
  galleryOpen: boolean
  generatedPreviewUrls: string[]
  pendingCount: number
  remainingCount: number
  targetCount: number
  onApprove: () => void
  onCloseGallery: () => void
  onReject: () => void
  onClose: () => void
  onOpenGallery: () => void
  onStartClassifier: () => void
  isMutating: boolean
}

export function ReviewQueue({
  asset,
  approvedCount,
  galleryOpen,
  generatedPreviewUrls,
  pendingCount,
  remainingCount,
  targetCount,
  onApprove,
  onCloseGallery,
  onReject,
  onClose,
  onOpenGallery,
  onStartClassifier,
  isMutating,
}: ReviewQueueProps) {
  const visibleReferenceUrls = asset?.referenceUrls.slice(0, 4) ?? []

  if (!asset) {
    return (
      <div className="review-overlay" role="presentation">
        <div className="review-overlay__backdrop" />
        <section aria-modal="true" className="review-overlay__dialog" role="dialog">
          <div className="review-overlay__head review-overlay__head--compact">
            <div>
              <p className="review-overlay__eyebrow">Отбор завершён</p>
              <h2 className="review-overlay__title">Очередь разобрана</h2>
            </div>
            <Button onClick={onClose} type="button" variant="ghost">
              Закрыть
            </Button>
          </div>

          <div className="review-card">
            <p className="review-card__empty">
              Все текущие кандидаты обработаны. Можно вернуться к модификации и собрать ещё данные или перейти к классификатору.
            </p>
            <div className="review-card__meta">
              <span>Подтверждено {approvedCount}</span>
              <span>Разобрано {targetCount}</span>
              <span>Осталось {remainingCount}</span>
            </div>
          </div>

          <div className="review-overlay__actions review-overlay__actions--end">
            <Button onClick={onClose} type="button" variant="secondary">
              Вернуться к модификации
            </Button>
            <Button onClick={onStartClassifier} type="button">
              К классификатору
            </Button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="review-overlay" role="presentation">
      <div className="review-overlay__backdrop" />
      <section aria-modal="true" className="review-overlay__dialog" role="dialog">
        <div className="review-overlay__head review-overlay__head--stacked">
          <div>
            <p className="review-overlay__eyebrow">Отбор результатов</p>
          </div>
          <div className="review-overlay__toolbar">
            <div className="review-overlay__stats">
              <span>Подтверждено {approvedCount}</span>
              <span>В очереди {pendingCount}</span>
              <span>Осталось добрать {remainingCount}</span>
            </div>
            <div className="review-overlay__toolbar-actions">
              {generatedPreviewUrls.length > 0 ? (
                <Button onClick={onOpenGallery} type="button" variant="secondary">
                  Синтетика ({generatedPreviewUrls.length})
                </Button>
              ) : null}
              <Button onClick={onClose} type="button" variant="ghost">
                Выйти
              </Button>
            </div>
          </div>
        </div>

        <div className="review-overlay__content">
          <div className="review-overlay__head">
            <div className="review-overlay__hero">
              <div className="review-overlay__hero-head">
                <span className="review-overlay__class">{asset.className}</span>
                <span className="review-overlay__counter">
                  {Math.max(1, targetCount - remainingCount + 1)} / {Math.max(targetCount, 1)}
                </span>
              </div>
              <img alt={`Результат для класса ${asset.className}`} className="review-card__image" src={asset.previewUrl} />
            </div>
          </div>

          <div className="review-overlay__rail">
            <div className="review-card">
              <p className="review-overlay__rail-title">Контекст</p>
              <div className="review-card__meta">
                <span>Класс {asset.className}</span>
                <span>В работе {pendingCount}</span>
                <span>Подтверждено {approvedCount}</span>
              </div>
            </div>

            {visibleReferenceUrls.length > 0 ? (
              <div className="review-card">
                <p className="review-overlay__rail-title">Образцы класса</p>
                <div className="review-overlay__samples">
                  {visibleReferenceUrls.map((referenceUrl, index) => (
                    <img
                      alt={`Семпл класса ${asset.className} ${index + 1}`}
                      className="review-overlay__sample"
                      key={`${asset.id}-${referenceUrl}-${index}`}
                      loading="lazy"
                      src={referenceUrl}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="review-overlay__actions">
          <Button disabled={isMutating} onClick={onClose} type="button" variant="ghost">
            Позже
          </Button>
          <Button disabled={isMutating} onClick={onReject} type="button" variant="danger">
            Отклонить
          </Button>
          <Button className="review-overlay__approve" disabled={isMutating} onClick={onApprove} type="button">
            Принять
          </Button>
        </div>
      </section>

      {galleryOpen ? (
        <section aria-modal="true" className="review-gallery" role="dialog">
          <div className="review-gallery__head">
            <div>
              <p className="review-overlay__eyebrow">Синтетические результаты</p>
              <h3 className="review-gallery__title">Текущая партия генерации</h3>
            </div>
            <Button onClick={onCloseGallery} type="button" variant="ghost">
              Закрыть
            </Button>
          </div>
          <div className="review-gallery__grid">
            {generatedPreviewUrls.map((previewUrl, index) => (
              <img
                alt={`Синтетический результат ${index + 1}`}
                className="review-gallery__image"
                key={`${previewUrl}-${index}`}
                loading="lazy"
                src={previewUrl}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
