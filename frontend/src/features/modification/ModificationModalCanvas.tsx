import { Button } from '@/shared/ui/buttons/Button'
import { ModificationCanvas } from '@/features/modification/ModificationCanvas'
import { ModificationMode } from '@/features/modification/ModificationModeToggle'
import { PromptFields } from '@/features/modification/PromptFields'
import { type AreaPoint, type ModifyFormValues } from '@/pages/modify/modify.types'
import { type ModificationSourceAsset } from '@/shared/types/workflow'
import { UseFormReturn } from 'react-hook-form'

type ModificationModalCanvasProps = {
  applyPromptToAll: boolean
  areaConfirmed: boolean
  areaPoints: AreaPoint[]
  form: UseFormReturn<ModifyFormValues>
  negativePromptValue: string
  mode: ModificationMode
  onApplyPromptToAllChange: (value: boolean) => void
  onAreaConfirm: () => void
  onAreaPointsChange: (value: AreaPoint[]) => void
  onPolygonClear: () => void
  onPolygonUndo: () => void
  onPromptChange: (value: string) => void
  onSamPromptChange: (value: string) => void
  onSourceMove: (direction: -1 | 1) => void
  onNegativePromptChange: (value: string) => void
  samPromptValue: string
  source: ModificationSourceAsset
  sourceIndex: number
  sourceItems: ModificationSourceAsset[]
}

export function ModificationModalCanvas({
  applyPromptToAll,
  areaConfirmed,
  areaPoints,
  form,
  mode,
  negativePromptValue,
  onApplyPromptToAllChange,
  onAreaConfirm,
  onAreaPointsChange,
  onPolygonClear,
  onPolygonUndo,
  onPromptChange,
  onSamPromptChange,
  onSourceMove,
  onNegativePromptChange,
  samPromptValue,
  source,
  sourceIndex,
  sourceItems,
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
        negativePromptValue={negativePromptValue}
        onApplyPromptToAllChange={onApplyPromptToAllChange}
        onNegativePromptChange={onNegativePromptChange}
        onPromptChange={onPromptChange}
        onSamPromptChange={onSamPromptChange}
        samPromptValue={samPromptValue}
      />
    </div>
  )
}
