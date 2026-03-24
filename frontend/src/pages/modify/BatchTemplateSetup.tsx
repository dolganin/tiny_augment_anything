import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/shared/ui/buttons/Button'
import { ModificationCanvas } from '@/features/modification/ModificationCanvas'
import { ModificationMode, ModificationModeToggle } from '@/features/modification/ModificationModeToggle'
import { PromptSaveIcon } from '@/features/modification/PromptSaveIcon'
import { type AreaPoint, type BatchPreviewSource } from '@/pages/modify/modify.types'

const EMPTY_TEMPLATE_VALUE = '__none__'
const NO_TEMPLATES_VALUE = '__empty__'

type BatchTemplateSetupProps = {
  areaConfirmed: boolean
  areaPoints: AreaPoint[]
  currentSource: BatchPreviewSource | null
  loraAdapters: Array<{ adapterPath: string; displayName: string }>
  mode: ModificationMode
  negativePromptValue: string
  onAreaConfirm: () => void
  onAreaPointsChange: (points: AreaPoint[]) => void
  onApplyTextTemplate: (templateId: string) => void
  onApplyNegativeTemplate: (templateId: string) => void
  onContinue: () => void
  onLoraChange: (value: string) => void
  onModeChange: (mode: ModificationMode) => void
  onNegativePromptChange: (value: string) => void
  onPolygonClear: () => void
  onPolygonUndo: () => void
  onPromptChange: (value: string) => void
  onSamPromptChange: (value: string) => void
  onApplySelectionTemplate: (templateId: string) => void
  onPreviewMaskChange: (points: AreaPoint[]) => void
  onSaveTextTemplate: () => void
  onSaveSelectionTemplate: () => void
  promptValue: string
  selectedLoraPath: string
  samPromptValue: string
  selectionTemplates: Array<{ id: string; name: string }>
  textTemplates: Array<{ id: string; name: string }>
}

export function BatchTemplateSetup({
  areaConfirmed,
  areaPoints,
  currentSource,
  loraAdapters,
  mode,
  negativePromptValue,
  onAreaConfirm,
  onAreaPointsChange,
  onApplyTextTemplate,
  onApplyNegativeTemplate,
  onContinue,
  onLoraChange,
  onModeChange,
  onNegativePromptChange,
  onPolygonClear,
  onPolygonUndo,
  onPromptChange,
  onSamPromptChange,
  onApplySelectionTemplate,
  onPreviewMaskChange,
  onSaveTextTemplate,
  onSaveSelectionTemplate,
  promptValue,
  selectedLoraPath,
  samPromptValue,
  selectionTemplates,
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

  const canContinue = promptValue.trim().length > 0 && (mode === 'full' || (areaConfirmed && areaPoints.length >= 3))

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
            <span className="generation-form__label">Режим модификации</span>
            <ModificationModeToggle mode={mode} onChange={onModeChange} />
          </label>
          <label className="batch-setup__field">
            <span className="batch-setup__label-row">
              <span>Промпт модификации</span>
              <span className="modification-prompts__field-actions">
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
            <select
              aria-label="Выбрать шаблон для промпта модификации"
              className="modification-prompts__template-select modification-prompts__template-select--below"
              defaultValue={textTemplates.length > 0 ? EMPTY_TEMPLATE_VALUE : NO_TEMPLATES_VALUE}
              disabled={textTemplates.length === 0}
              onChange={(event) => {
                const selectedId = event.target.value
                if (selectedId === EMPTY_TEMPLATE_VALUE || selectedId === NO_TEMPLATES_VALUE) {
                  return
                }
                onApplyTextTemplate(selectedId)
                event.currentTarget.value = EMPTY_TEMPLATE_VALUE
              }}
            >
              {textTemplates.length > 0 ? <option value={EMPTY_TEMPLATE_VALUE}>Выбрать шаблон промпта</option> : <option value={NO_TEMPLATES_VALUE}>Нет шаблонов промпта</option>}
              {textTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
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
            <select
              aria-label="Выбрать шаблон для negative prompt"
              className="modification-prompts__template-select modification-prompts__template-select--below"
              defaultValue={textTemplates.length > 0 ? EMPTY_TEMPLATE_VALUE : NO_TEMPLATES_VALUE}
              disabled={textTemplates.length === 0}
              onChange={(event) => {
                const selectedId = event.target.value
                if (selectedId === EMPTY_TEMPLATE_VALUE || selectedId === NO_TEMPLATES_VALUE) {
                  return
                }
                onApplyNegativeTemplate(selectedId)
                event.currentTarget.value = EMPTY_TEMPLATE_VALUE
              }}
            >
              {textTemplates.length > 0 ? <option value={EMPTY_TEMPLATE_VALUE}>Выбрать шаблон negative prompt</option> : <option value={NO_TEMPLATES_VALUE}>Нет шаблонов negative prompt</option>}
              {textTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label className="batch-setup__field">
            <span className="batch-setup__label-row">
              <span>SAM prompt</span>
              <Button
                aria-label="Сохранить selection шаблон"
                className="modification-prompts__save-button"
                onClick={onSaveSelectionTemplate}
                title="Сохранить selection шаблон"
                type="button"
                variant="ghost"
              >
                <PromptSaveIcon />
              </Button>
            </span>
            <textarea
              onChange={(event) => onSamPromptChange(event.target.value)}
              placeholder="Опиши область для текстовой сегментации, если хочешь использовать SAM по тексту вместо полигона."
              rows={3}
              value={samPromptValue}
            />
            <select
              aria-label="Выбрать selection шаблон"
              className="modification-prompts__template-select modification-prompts__template-select--below"
              defaultValue={selectionTemplates.length > 0 ? EMPTY_TEMPLATE_VALUE : NO_TEMPLATES_VALUE}
              disabled={selectionTemplates.length === 0}
              onChange={(event) => {
                const selectedId = event.target.value
                if (selectedId === EMPTY_TEMPLATE_VALUE || selectedId === NO_TEMPLATES_VALUE) {
                  return
                }
                onApplySelectionTemplate(selectedId)
                event.currentTarget.value = EMPTY_TEMPLATE_VALUE
              }}
            >
              {selectionTemplates.length > 0 ? <option value={EMPTY_TEMPLATE_VALUE}>Выбрать selection шаблон</option> : <option value={NO_TEMPLATES_VALUE}>Нет selection шаблонов</option>}
              {selectionTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label className="batch-setup__field">
            <span className="generation-form__label">LoRA adapter</span>
            <select
              className="modification-prompts__template-select modification-prompts__template-select--below"
              onChange={(event) => onLoraChange(event.target.value)}
              value={selectedLoraPath}
            >
              <option value="">Без LoRA</option>
              {loraAdapters.map((adapter) => (
                <option key={adapter.adapterPath} value={adapter.adapterPath}>
                  {adapter.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="batch-setup__canvas">
          {currentSource ? (
            <>
              {mode === 'inpaint' ? (
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
                <div className="batch-setup__empty">
                  Режим full remodification выбран. Маска для batch-запуска не используется.
                </div>
              )}
            </>
          ) : (
            <div className="batch-setup__empty">Нет доступных approved-источников для batch-модификации.</div>
          )}
        </div>
      </div>
    </section>
  )
}
