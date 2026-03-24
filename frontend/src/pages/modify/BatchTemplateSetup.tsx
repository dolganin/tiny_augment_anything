import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/shared/ui/buttons/Button'
import { ModificationCanvas } from '@/features/modification/ModificationCanvas'
import { type AreaPoint, type BatchPreviewSource } from '@/pages/modify/modify.types'

type BatchTemplateSetupProps = {
  areaConfirmed: boolean
  areaPoints: AreaPoint[]
  currentSource: BatchPreviewSource | null
  negativePromptValue: string
  onAreaConfirm: () => void
  onAreaPointsChange: (points: AreaPoint[]) => void
  onContinue: () => void
  onNegativePromptChange: (value: string) => void
  onPolygonClear: () => void
  onPolygonUndo: () => void
  onPromptChange: (value: string) => void
  onPreviewMaskChange: (points: AreaPoint[]) => void
  promptValue: string
}

export function BatchTemplateSetup({
  areaConfirmed,
  areaPoints,
  currentSource,
  negativePromptValue,
  onAreaConfirm,
  onAreaPointsChange,
  onContinue,
  onNegativePromptChange,
  onPolygonClear,
  onPolygonUndo,
  onPromptChange,
  onPreviewMaskChange,
  promptValue,
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
            <span>Промпт модификации</span>
            <textarea
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="Опиши изменение для всей batch-пачки"
              rows={4}
              value={promptValue}
            />
          </label>
          <label className="batch-setup__field">
            <span>Негативный промпт</span>
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
