import { useMemo, useState } from 'react'
import { Button } from '@/shared/ui/buttons/Button'
import { GenerationConfigFields } from '@/features/generation-config/GenerationConfigFields'
import { ModificationMode } from '@/features/modification/ModificationModeToggle'
import { MaskOverlay } from '@/pages/modify/MaskOverlay'
import { type AreaPoint, type BatchPreviewSource } from '@/pages/modify/modify.types'

type ConfigField = {
  key: string
  label: string
  type: string
  value: string
  options?: string[]
}

type BatchValidationModalProps = {
  fieldValues: Record<string, string>
  mode: ModificationMode
  onClose: () => void
  onFieldValueChange: (key: string, value: string) => void
  onSubmit: () => void
  open: boolean
  previewMask: AreaPoint[]
  priorityFields: ConfigField[]
  secondaryFields: ConfigField[]
  selectedSources: BatchPreviewSource[]
  startPending: boolean
}

export function BatchValidationModal({
  fieldValues,
  mode,
  onClose,
  onFieldValueChange,
  onSubmit,
  open,
  previewMask,
  priorityFields,
  secondaryFields,
  selectedSources,
  startPending,
}: BatchValidationModalProps) {
  const [secondaryOpen, setSecondaryOpen] = useState(false)

  const totalGenerations = useMemo(() => {
    const rawValue = fieldValues.samples_per_image ?? fieldValues.sample_count ?? '1'
    const count = Number.parseInt(rawValue, 10)
    return selectedSources.length * (Number.isFinite(count) && count > 0 ? count : 1)
  }, [fieldValues.sample_count, fieldValues.samples_per_image, selectedSources.length])

  if (!open) {
    return null
  }

  return (
    <div className="batch-validation-modal-layer" role="presentation">
      <div className="batch-validation-modal-backdrop" onClick={onClose} />
      <section aria-modal="true" className="batch-validation-modal" role="dialog">
        <header className="batch-validation-modal__header">
          <div>
            <h2>Валидация batch-модификации</h2>
            <p>Проверь маску на выбранных источниках и только потом запускай генерацию.</p>
          </div>
          <button aria-label="Закрыть окно валидации batch-модификации" className="batch-validation-modal__close" onClick={onClose} type="button">
            ×
          </button>
        </header>

        <div className="batch-validation-modal__content">
          <div className="batch-validation-modal__preview">
            <div className="batch-validation-modal__summary">
              <span>Источников: <strong>{selectedSources.length}</strong></span>
              <span>Будет сгенерировано: <strong>{totalGenerations}</strong></span>
            </div>
            <div className="batch-validation-preview-grid">
              {selectedSources.map((source) => (
                <article className="batch-validation-preview-card" key={source.assetId}>
                  <div className="batch-validation-preview-card__media">
                    <img alt={source.className} src={source.assetUrl} />
                    <MaskOverlay points={previewMask} />
                  </div>
                  <div className="batch-validation-preview-card__meta">
                    <strong>{source.className}</strong>
                    <span>{source.assetId.slice(0, 8)}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="batch-validation-modal__params">
            <section className="modification-modal__panel">
              <div className="modification-modal__section-head">
                <h3 className="modification-modal__section-title">Параметры генерации</h3>
              </div>
              <div className="modification-modal__summary">
                <span className="modification-modal__summary-label">Режим</span>
                <strong className="modification-modal__summary-value">{mode === 'inpaint' ? 'Inpaint' : 'Full remodification'}</strong>
              </div>
              <GenerationConfigFields
                className="modification-modal__fields"
                fields={priorityFields}
                onChange={onFieldValueChange}
                values={fieldValues}
              />
            </section>

            {secondaryFields.length > 0 ? (
              <section className="modification-modal__panel">
                <div className="modification-modal__section-head modification-modal__section-head--spread">
                  <h3 className="modification-modal__section-title">Дополнительные параметры</h3>
                  <Button onClick={() => setSecondaryOpen((current) => !current)} type="button" variant="ghost">
                    {secondaryOpen ? 'Скрыть' : 'Показать'}
                  </Button>
                </div>
                {secondaryOpen ? (
                  <GenerationConfigFields
                    className="modification-modal__fields"
                    fields={secondaryFields}
                    onChange={onFieldValueChange}
                    values={fieldValues}
                  />
                ) : null}
              </section>
            ) : null}
          </aside>
        </div>

        <footer className="batch-validation-modal__footer">
          <Button onClick={onClose} type="button" variant="ghost">
            Отмена
          </Button>
          <Button disabled={startPending} onClick={onSubmit} type="button">
            Запустить batch-модификацию
          </Button>
        </footer>
      </section>
    </div>
  )
}
