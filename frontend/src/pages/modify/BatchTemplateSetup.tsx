import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/shared/ui/buttons/Button'
import { ModificationCanvas } from '@/features/modification/ModificationCanvas'
import { PromptSaveIcon } from '@/features/modification/PromptSaveIcon'
import { type AreaPoint, type BatchPreviewSource } from '@/pages/modify/modify.types'

const EMPTY_TEMPLATE_VALUE = '__none__'

type BatchTemplateSetupProps = {
  areaConfirmed: boolean
  areaPoints: AreaPoint[]
  currentSource: BatchPreviewSource | null
  negativePromptValue: string
  onAreaConfirm: () => void
  onAreaPointsChange: (points: AreaPoint[]) => void
  onApplyTextTemplate: (templateId: string) => void
  onContinue: () => void
  onNegativePromptChange: (value: string) => void
  onPolygonClear: () => void
  onPolygonUndo: () => void
  onPromptChange: (value: string) => void
  onPreviewMaskChange: (points: AreaPoint[]) => void
  onSaveTextTemplate: () => void
  promptValue: string
  textTemplates: Array<{ id: string; name: string }>
}

export function BatchTemplateSetup({
  areaConfirmed,
  areaPoints,
  currentSource,
  negativePromptValue,
  onAreaConfirm,
  onAreaPointsChange,
  onApplyTextTemplate,
  onContinue,
  onNegativePromptChange,
  onPolygonClear,
  onPolygonUndo,
  onPromptChange,
  onPreviewMaskChange,
  onSaveTextTemplate,
  promptValue,
  textTemplates,
}: BatchTemplateSetupProps) {
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    setImageSize(null)
  }, [currentSource?.assetId])

  const normalizedMask = useMemo(() => {
    if (!imageSize || areaPoints.length < 3) {
      return []
    }
    return areaPoints.map<AreaPoint>(([x, y]) => [x / imageSize.width, y / imageSize.height])
  }, [areaPoints, imageSize])

  useEffect(() => {
    onPreviewMaskChange(normalizedMask)
  }, [normalizedMask, onPreviewMaskChange])

  const canContinue = promptValue.trim().length > 0 && areaConfirmed && areaPoints.length >= 3

  return (
    <section className="info-card batch-setup">
      <div className="batch-setup__head">
        <div>
          <strong>Шаг 1: Шаблон модификации</strong>
          <p className="info-card__text">Задай общий промпт и нарисуй маску на референсном изображении.</p>
        </div>
        <Button disabled={!canContinue} onClick={onContinue} type="button">
          Готово, выбрать источники
        </Button>
      </div>

      <div className="batch-setup__content">
        <div className="batch-setup__prompts">
          <label className="batch-setup__field">
            <span className="batch-setup__label-row">
              <span>Промпт модификации</span>
              <span className="modification-prompts__field-actions">
                {textTemplates.length > 0 ? (
                  <select
                    aria-label="Выбрать текстовый шаблон"
                    className="modification-prompts__template-select"
                    defaultValue={EMPTY_TEMPLATE_VALUE}
                    onChange={(event) => {
                      const selectedId = event.target.value
                      if (selectedId === EMPTY_TEMPLATE_VALUE) {
                        return
                      }
                      onApplyTextTemplate(selectedId)
                      event.currentTarget.value = EMPTY_TEMPLATE_VALUE
                    }}
                  >
                    <option value={EMPTY_TEMPLATE_VALUE}>Шаблон</option>
                    {textTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <Button
                  aria-label="Сохранить текстовый шаблон"
                  className="modification-prompts__save-button"
                  onClick={onSaveTextTemplate}
                  title="Сохранить текстовый шаблон"
                  type="button"
                  variant="ghost"
                >
                  <PromptSaveIcon />
                </Button>
              </span>
            </span>
            <textarea
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="Опиши изменение для всей batch-пачки"
              rows={4}
              value={promptValue}
            />
          </label>
          <label className="batch-setup__field">
            <span className="batch-setup__label-row">
              <span>Негативный промпт</span>
              <Button
                aria-label="Сохранить текстовый шаблон"
                className="modification-prompts__save-button"
                onClick={onSaveTextTemplate}
                title="Сохранить текстовый шаблон"
                type="button"
                variant="ghost"
              >
                <PromptSaveIcon />
              </Button>
            </span>
            <textarea
              onChange={(event) => onNegativePromptChange(event.target.value)}
              placeholder="Чего не должно быть в результате"
              rows={3}
              value={negativePromptValue}
            />
          </label>
        </div>

        <div className="batch-setup__canvas">
          {currentSource ? (
            <>
              <ModificationCanvas
                areaConfirmed={areaConfirmed}
                areaPoints={areaPoints}
                className={currentSource.className}
                imageUrl={currentSource.assetUrl}
                onAreaPointsChange={onAreaPointsChange}
                onImageMetricsChange={setImageSize}
              />
              <div className="batch-setup__actions">
                <Button disabled={areaPoints.length < 3 || areaConfirmed} onClick={onAreaConfirm} type="button" variant="secondary">
                  Применить область
                </Button>
                <Button disabled={areaPoints.length === 0} onClick={onPolygonUndo} type="button" variant="ghost">
                  Удалить вершину
                </Button>
                <Button disabled={areaPoints.length === 0} onClick={onPolygonClear} type="button" variant="ghost">
                  Очистить
                </Button>
              </div>
            </>
          ) : (
            <div className="batch-setup__empty">Нет доступных approved-источников для batch-модификации.</div>
          )}
        </div>
      </div>
    </section>
  )
}
