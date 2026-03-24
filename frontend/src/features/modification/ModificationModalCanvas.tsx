import { Button } from '@/shared/ui/buttons/Button'
import { ModificationCanvas } from '@/features/modification/ModificationCanvas'
import { ModificationMode } from '@/features/modification/ModificationModeToggle'
import { PromptFields } from '@/features/modification/PromptFields'
import { type AreaPoint, type ModificationLaunchMode, type ModifyFormValues, type PromptTemplate } from '@/pages/modify/modify.types'
import { type ModificationSourceAsset } from '@/shared/types/workflow'
import { UseFormReturn } from 'react-hook-form'

type ModificationModalCanvasProps = {
  applyPromptToAll: boolean
  areaConfirmed: boolean
  areaPoints: AreaPoint[]
  form: UseFormReturn<ModifyFormValues>
  launchMode: ModificationLaunchMode
  negativePromptValue: string
  mode: ModificationMode
  onApplyTemplate: (template: PromptTemplate) => void
  onApplyPromptToAllChange: (value: boolean) => void
  onAreaConfirm: () => void
  onAreaPointsChange: (value: AreaPoint[]) => void
  onDeleteTemplate: (templateId: string) => void
  onPolygonClear: () => void
  onPolygonUndo: () => void
  onPromptChange: (value: string) => void
  onSamPromptChange: (value: string) => void
  onSaveTemplate: (scope: PromptTemplate['scope']) => void
  onSourceMove: (direction: -1 | 1) => void
  onToggleSourceSelection: (assetId: string) => void
  onNegativePromptChange: (value: string) => void
  samPromptValue: string
  selectionTemplates: PromptTemplate[]
  selectedSourceCount: number
  selectedSourceIds: Record<string, boolean>
  source: ModificationSourceAsset
  sourceIndex: number
  sourceItems: ModificationSourceAsset[]
  textTemplates: PromptTemplate[]
}

export function ModificationModalCanvas({
  applyPromptToAll,
  areaConfirmed,
  areaPoints,
  form,
  launchMode,
  mode,
  negativePromptValue,
  onApplyTemplate,
  onApplyPromptToAllChange,
  onAreaConfirm,
  onAreaPointsChange,
  onDeleteTemplate,
  onPolygonClear,
  onPolygonUndo,
  onPromptChange,
  onSamPromptChange,
  onSaveTemplate,
  onSourceMove,
  onToggleSourceSelection,
  onNegativePromptChange,
  samPromptValue,
  selectionTemplates,
  selectedSourceCount,
  selectedSourceIds,
  source,
  sourceIndex,
  sourceItems,
  textTemplates,
}: ModificationModalCanvasProps) {
  return (
    <div className="modification-modal__canvas-column">
      <div className="modification-modal__canvas-frame">
        <Button
          className="modify-source-nav__button"
          disabled={sourceItems.length <= 1}
          onClick={() => onSourceMove(-1)}
          type="button"
          variant="ghost"
        >
          ←
        </Button>
        <ModificationCanvas
          areaConfirmed={areaConfirmed}
          areaPoints={areaPoints}
          className={source.className}
          imageUrl={source.assetUrl}
          onAreaPointsChange={onAreaPointsChange}
        />
        <Button
          className="modify-source-nav__button"
          disabled={sourceItems.length <= 1}
          onClick={() => onSourceMove(1)}
          type="button"
          variant="ghost"
        >
          →
        </Button>
      </div>

      <div className="modification-modal__canvas-meta">
        <span className="modify-source-nav__status">
          {sourceIndex + 1} / {sourceItems.length}
        </span>
      </div>

      <PromptFields
        applyPromptToAll={applyPromptToAll}
        form={form}
        launchMode={launchMode}
        negativePromptValue={negativePromptValue}
        onApplyTemplate={onApplyTemplate}
        onApplyPromptToAllChange={onApplyPromptToAllChange}
        onDeleteTemplate={onDeleteTemplate}
        onNegativePromptChange={onNegativePromptChange}
        onPromptChange={onPromptChange}
        onSamPromptChange={onSamPromptChange}
        onSaveTemplate={onSaveTemplate}
        samPromptValue={samPromptValue}
        selectionTemplates={selectionTemplates}
        sourceClassName={source.className}
        textTemplates={textTemplates}
      />

      {launchMode === 'batch' ? (
        <section className="modification-modal__panel">
          <div className="modification-modal__section-head modification-modal__section-head--spread">
            <h3 className="modification-modal__section-title">Batch-источники</h3>
            <span className="modification-modal__selection-summary">{selectedSourceCount} выбрано</span>
          </div>
          <div className="modification-modal__source-grid">
            {sourceItems.map((item) => {
              const selected = selectedSourceIds[item.assetId] !== false
              const isCurrent = item.assetId === source.assetId
              return (
                <button
                  className={`modification-modal__source-chip${selected ? ' modification-modal__source-chip--selected' : ''}${isCurrent ? ' modification-modal__source-chip--current' : ''}`}
                  key={item.assetId}
                  onClick={() => onToggleSourceSelection(item.assetId)}
                  type="button"
                >
                  <span>{item.className}</span>
                  <strong>{selected ? 'в batch' : 'пропуск'}</strong>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}
    </div>
  )
}
