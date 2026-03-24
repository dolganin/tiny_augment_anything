import { FormEvent } from 'react'
import { Button } from '@/shared/ui/buttons/Button'
import { ModificationModalCanvas } from '@/features/modification/ModificationModalCanvas'
import { ModificationMode } from '@/features/modification/ModificationModeToggle'
import { ModificationModalParams } from '@/features/modification/ModificationModalParams'
import { type AreaPoint, type ModificationLaunchMode, type ModifyFormValues, type PromptTemplate } from '@/pages/modify/modify.types'
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
  launchMode: ModificationLaunchMode
  loraAdapters: Array<{ adapterPath: string; displayName: string }>
  mode: ModificationMode
  negativePromptValue: string
  onApplyTemplate: (template: PromptTemplate) => void
  onApplyPromptToAllChange: (value: boolean) => void
  onAreaConfirm: () => void
  onAreaPointsChange: (value: AreaPoint[]) => void
  onClose: () => void
  onFieldValueChange: (key: string, value: string) => void
  onLoraChange: (value: string) => void
  onModeChange: (mode: ModificationMode) => void
  onOpenReview: () => void
  onPolygonClear: () => void
  onPolygonUndo: () => void
  onPromptChange: (value: string) => void
  onSaveTemplate: (scope: PromptTemplate['scope']) => void
  onSavePolygonTemplate: () => void
  onSourceMove: (direction: -1 | 1) => void
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void
  onNegativePromptChange: (value: string) => void
  onToggleSourceSelection: (assetId: string) => void
  open: boolean
  priorityFields: ConfigField[]
  reviewPendingCount: number
  selectedLoraPath: string
  selectedSourceCount: number
  selectedSourceIds: Record<string, boolean>
  secondaryFields: ConfigField[]
  source: ModificationSourceAsset | null
  sourceIndex: number
  sourceItems: ModificationSourceAsset[]
  startPending: boolean
  submitLabel?: string
  textTemplates: PromptTemplate[]
  totalTargetCount: number
}

export function ModificationModal({
  applyPromptToAll,
  areaConfirmed,
  areaPoints,
  fieldValues,
  form,
  launchMode,
  loraAdapters,
  mode,
  negativePromptValue,
  onApplyTemplate,
  onApplyPromptToAllChange,
  onAreaConfirm,
  onAreaPointsChange,
  onClose,
  onFieldValueChange,
  onLoraChange,
  onModeChange,
  onOpenReview,
  onPolygonClear,
  onPolygonUndo,
  onPromptChange,
  onSaveTemplate,
  onSavePolygonTemplate,
  onSourceMove,
  onSubmit,
  onNegativePromptChange,
  onToggleSourceSelection,
  open,
  priorityFields,
  reviewPendingCount,
  selectedLoraPath,
  selectedSourceCount,
  selectedSourceIds,
  secondaryFields,
  source,
  sourceIndex,
  sourceItems,
  startPending,
  submitLabel = 'Запустить модификацию',
  textTemplates,
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
          <div className="modification-modal__header-main">
            <h2 className="modification-modal__title">
              {launchMode === 'batch' ? 'Пакетная модификация' : 'Модификация изображения'}
            </h2>
            <div className="modification-modal__header-divider" />
            <div className="modification-modal__polygon-actions modification-modal__polygon-actions--header">
              <Button onClick={onSavePolygonTemplate} type="button" variant="ghost">
                Сохранить шаблон полигона
              </Button>
              <Button disabled={mode === 'full' || areaPoints.length < 3 || areaConfirmed} onClick={onAreaConfirm} type="button" variant="secondary">
                Применить область
              </Button>
              <Button disabled={mode === 'full' || areaPoints.length === 0} onClick={onPolygonUndo} type="button" variant="ghost">
                Удалить вершину
              </Button>
              <Button disabled={mode === 'full' || areaPoints.length === 0} onClick={onPolygonClear} type="button" variant="ghost">
                Очистить
              </Button>
            </div>
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
            launchMode={launchMode}
            loraAdapters={loraAdapters}
            mode={mode}
            negativePromptValue={negativePromptValue}
            onApplyTemplate={onApplyTemplate}
            onApplyPromptToAllChange={onApplyPromptToAllChange}
            onAreaConfirm={onAreaConfirm}
            onAreaPointsChange={onAreaPointsChange}
            onLoraChange={onLoraChange}
            onPolygonClear={onPolygonClear}
            onPolygonUndo={onPolygonUndo}
            onPromptChange={onPromptChange}
            onSaveTemplate={onSaveTemplate}
            onSourceMove={onSourceMove}
            onNegativePromptChange={onNegativePromptChange}
            selectedLoraPath={selectedLoraPath}
            selectedSourceIds={selectedSourceIds}
            selectedSourceCount={selectedSourceCount}
            source={source}
            sourceIndex={sourceIndex}
            sourceItems={sourceItems}
            textTemplates={textTemplates}
            onToggleSourceSelection={onToggleSourceSelection}
          />

          <ModificationModalParams
            fieldValues={fieldValues}
            mode={mode}
            onFieldValueChange={onFieldValueChange}
            onModeChange={onModeChange}
            priorityFields={priorityFields}
            selectedSourceCount={selectedSourceCount}
            secondaryFields={secondaryFields}
            totalTargetCount={totalTargetCount}
          />

          <footer className="modification-modal__footer">
            <div className="modification-modal__footer-meta">
              <span>Источник {sourceIndex + 1} из {sourceItems.length}</span>
              <span>Выбрано источников: {selectedSourceCount}</span>
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
                {submitLabel}
              </Button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}
