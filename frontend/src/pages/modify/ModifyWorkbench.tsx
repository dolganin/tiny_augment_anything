import { UseFormReturn } from 'react-hook-form'
import { Button } from '@/shared/ui/buttons/Button'
import { GenerationConfigFields } from '@/features/generation-config/GenerationConfigFields'
import { ModificationCanvas } from '@/features/modification/ModificationCanvas'
import { type AreaPoint, type ModifyFormValues } from '@/pages/modify/modify.types'
import { type ModificationSourceAsset } from '@/shared/types/workflow'

type ConfigField = {
  key: string
  label: string
  type: string
  value: string
  options?: string[]
}

type ModifyWorkbenchProps = {
  areaConfirmed: boolean
  areaPoints: AreaPoint[]
  fieldValues: Record<string, string>
  form: UseFormReturn<ModifyFormValues>
  negativePromptValue: string
  onAreaConfirm: () => void
  onAreaPointsChange: (value: AreaPoint[]) => void
  onFieldValueChange: (key: string, value: string) => void
  onOpenReview: () => void
  onPolygonClear: () => void
  onPolygonUndo: () => void
  onSourceMove: (direction: -1 | 1) => void
  onSubmit: React.FormEventHandler<HTMLFormElement>
  priorityFields: ConfigField[]
  reviewPendingCount: number
  samPromptValue: string
  secondaryFields: ConfigField[]
  source: ModificationSourceAsset
  sourceIndex: number
  sourceItems: ModificationSourceAsset[]
  startPending: boolean
  totalTargetCount: number
}

export function ModifyWorkbench({
  areaConfirmed,
  areaPoints,
  fieldValues,
  form,
  negativePromptValue,
  onAreaConfirm,
  onAreaPointsChange,
  onFieldValueChange,
  onOpenReview,
  onPolygonClear,
  onPolygonUndo,
  onSourceMove,
  onSubmit,
  priorityFields,
  reviewPendingCount,
  samPromptValue,
  secondaryFields,
  source,
  sourceIndex,
  sourceItems,
  startPending,
  totalTargetCount,
}: ModifyWorkbenchProps) {
  return (
    <form className="modify-layout modify-workbench" onSubmit={onSubmit}>
      <section className="generation-form generation-form--stacked modify-panel modify-panel--primary">
        <label className="generation-form__group">
          <span className="generation-form__label">Промпт модификации</span>
          <textarea
            className="generation-form__textarea generation-form__textarea--hero"
            placeholder="Опиши, какую вариацию нужно получить на основе этого изображения."
            {...form.register('prompt', { required: true })}
          />
        </label>

        <label className="generation-form__group">
          <span className="generation-form__label">Negative prompt</span>
          <textarea
            className="generation-form__textarea"
            onChange={(event) => onFieldValueChange('negative_prompt', event.target.value)}
            placeholder="Опиши, чего не должно быть в результате."
            value={negativePromptValue}
          />
        </label>

        <label className="generation-form__group">
          <span className="generation-form__label">SAM prompt</span>
          <textarea
            className="generation-form__textarea modify-workbench__sam-prompt"
            onChange={(event) => onFieldValueChange('sam_prompt', event.target.value)}
            placeholder="Опиши область для текстовой сегментации, если хочешь использовать SAM по тексту вместо полигона."
            value={samPromptValue}
          />
        </label>

        <div className="info-card">
          <p className="info-card__text">
            План генерации взят со страницы статистики: <strong>{totalTargetCount}</strong> изображений суммарно.
          </p>
          <p className="info-card__text">
            Источник: <strong>{source.className}</strong>
          </p>
        </div>

        <div className="modify-panel__actions">
          <Button disabled={startPending} type="submit">
            Запустить модификацию
          </Button>
          {reviewPendingCount > 0 ? (
            <Button onClick={onOpenReview} type="button" variant="secondary">
              Открыть отбор ({reviewPendingCount})
            </Button>
          ) : null}
        </div>
      </section>

      <div className="modify-layout__viewer">
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
      </div>

      <section className="generation-form generation-form--stacked modify-controls modify-panel modify-panel--secondary">
        {priorityFields.length > 0 ? (
          <div className="generation-form generation-form--stacked modify-panel modify-panel--inline">
            <GenerationConfigFields fields={priorityFields} onChange={onFieldValueChange} values={fieldValues} />
          </div>
        ) : null}
        <div className="modify-controls__actions">
          <Button disabled={areaPoints.length < 3 || areaConfirmed} onClick={onAreaConfirm} type="button">
            Применить область
          </Button>
          <Button disabled={areaPoints.length === 0} onClick={onPolygonUndo} type="button" variant="ghost">
            Удалить вершину
          </Button>
          <Button disabled={areaPoints.length === 0} onClick={onPolygonClear} type="button" variant="ghost">
            Очистить полигон
          </Button>
        </div>

        {secondaryFields.length > 0 ? (
          <GenerationConfigFields fields={secondaryFields} onChange={onFieldValueChange} values={fieldValues} />
        ) : null}
      </section>
    </form>
  )
}
