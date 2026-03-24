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
      <ModificationCanvas
        areaConfirmed={areaConfirmed}
        areaPoints={areaPoints}
        className={source.className}
        imageUrl={source.assetUrl}
        onAreaPointsChange={onAreaPointsChange}
      />

      <div className="modify-source-nav">
        <Button disabled={sourceItems.length <= 1} onClick={() => onSourceMove(-1)} type="button" variant="ghost">
          Предыдущее
        </Button>
        <span className="modify-source-nav__status">
          {sourceIndex + 1} / {sourceItems.length}
        </span>
        <Button disabled={sourceItems.length <= 1} onClick={() => onSourceMove(1)} type="button" variant="ghost">
          Следующее
        </Button>
      </div>

      <div className="modification-modal__polygon-actions">
        <Button disabled={mode === 'full' || areaPoints.length < 3 || areaConfirmed} onClick={onAreaConfirm} type="button">
          Применить область
        </Button>
        <Button disabled={mode === 'full' || areaPoints.length === 0} onClick={onPolygonUndo} type="button" variant="ghost">
          Удалить вершину
        </Button>
        <Button disabled={mode === 'full' || areaPoints.length === 0} onClick={onPolygonClear} type="button" variant="ghost">
          Очистить полигон
        </Button>
      </div>
      {mode === 'full' ? (
        <p className="modification-modal__hint">
          В режиме full remodification полигон не используется, будет переработано всё изображение.
        </p>
      ) : null}

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
