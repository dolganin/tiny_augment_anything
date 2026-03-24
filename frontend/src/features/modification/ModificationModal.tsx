import { FormEvent } from 'react'
import { Button } from '@/shared/ui/buttons/Button'
import { ModificationModalCanvas } from '@/features/modification/ModificationModalCanvas'
import { ModificationMode } from '@/features/modification/ModificationModeToggle'
import { ModificationModalParams } from '@/features/modification/ModificationModalParams'
import { type AreaPoint, type ModifyFormValues } from '@/pages/modify/modify.types'
import { type ModificationSourceAsset } from '@/shared/types/workflow'
import { UseFormReturn } from 'react-hook-form'
import '@/features/modification/modification-modal.css'

type ConfigField = {
  key: string
  label: string
  type: string
  value: string
  options?: string[]
}

type ModificationModalProps = {
  applyPromptToAll: boolean
  areaConfirmed: boolean
  areaPoints: AreaPoint[]
  fieldValues: Record<string, string>
  form: UseFormReturn<ModifyFormValues>
  mode: ModificationMode
  negativePromptValue: string
  onApplyPromptToAllChange: (value: boolean) => void
  onAreaConfirm: () => void
  onAreaPointsChange: (value: AreaPoint[]) => void
  onClose: () => void
  onFieldValueChange: (key: string, value: string) => void
  onModeChange: (mode: ModificationMode) => void
  onOpenReview: () => void
  onPolygonClear: () => void
  onPolygonUndo: () => void
  onPromptChange: (value: string) => void
  onSamPromptChange: (value: string) => void
  onSourceMove: (direction: -1 | 1) => void
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void
  onNegativePromptChange: (value: string) => void
  open: boolean
  priorityFields: ConfigField[]
  reviewPendingCount: number
  samPromptValue: string
  secondaryFields: ConfigField[]
  source: ModificationSourceAsset | null
  sourceIndex: number
  sourceItems: ModificationSourceAsset[]
  startPending: boolean
  totalTargetCount: number
}

export function ModificationModal({
  applyPromptToAll,
  areaConfirmed,
  areaPoints,
  form,
  mode,
  negativePromptValue,
  onApplyPromptToAllChange,
  onAreaConfirm,
  onAreaPointsChange,
  onClose,
  onFieldValueChange,
  fieldValues,
  onModeChange,
  onOpenReview,
  onPolygonClear,
  onPolygonUndo,
  onPromptChange,
  onSamPromptChange,
  onSourceMove,
  onSubmit,
  onNegativePromptChange,
  open,
  priorityFields,
  reviewPendingCount,
  samPromptValue,
  secondaryFields,
  source,
  sourceIndex,
  sourceItems,
  startPending,
  totalTargetCount,
}: ModificationModalProps) {
  if (!open || !source) {
    return null
  }

  return (
    <div className="modification-modal-layer" role="presentation">
      <div className="modification-modal-backdrop" onClick={onClose} />
      <section aria-modal="true" className="modification-modal" role="dialog">
        <header className="modification-modal__header">
          <div>
            <p className="modification-modal__eyebrow">Редактор модификации</p>
            <h2 className="modification-modal__title">Подготовь промпт и параметры генерации</h2>
          </div>
          <button aria-label="Закрыть модальное окно модификации" className="modification-modal__close" onClick={onClose} type="button">
            ×
          </button>
        </header>

        <form className="modification-modal__content" onSubmit={onSubmit}>
          <ModificationModalCanvas
            applyPromptToAll={applyPromptToAll}
            areaConfirmed={areaConfirmed}
            areaPoints={areaPoints}
            form={form}
            mode={mode}
            negativePromptValue={negativePromptValue}
            onApplyPromptToAllChange={onApplyPromptToAllChange}
            onAreaConfirm={onAreaConfirm}
            onAreaPointsChange={onAreaPointsChange}
            onPolygonClear={onPolygonClear}
            onPolygonUndo={onPolygonUndo}
            onPromptChange={onPromptChange}
            onSamPromptChange={onSamPromptChange}
            onSourceMove={onSourceMove}
            onNegativePromptChange={onNegativePromptChange}
            samPromptValue={samPromptValue}
            source={source}
            sourceIndex={sourceIndex}
            sourceItems={sourceItems}
          />

          <ModificationModalParams
            fieldValues={fieldValues}
            mode={mode}
            onFieldValueChange={onFieldValueChange}
            onModeChange={onModeChange}
            priorityFields={priorityFields}
            secondaryFields={secondaryFields}
            sourceClassName={source.className}
            totalTargetCount={totalTargetCount}
          />

          <footer className="modification-modal__footer">
            <div className="modification-modal__footer-meta">
              <span>Источник {sourceIndex + 1} из {sourceItems.length}</span>
              <span>Результатов в review: {reviewPendingCount}</span>
            </div>
            <div className="modification-modal__footer-actions">
              {reviewPendingCount > 0 ? (
                <Button onClick={onOpenReview} type="button" variant="secondary">
                  Открыть отбор ({reviewPendingCount})
                </Button>
              ) : null}
              <Button onClick={onClose} type="button" variant="ghost">
                Закрыть
              </Button>
              <Button disabled={startPending} type="submit">
                Запустить модификацию
              </Button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}
