import { Button } from '@/shared/ui/buttons/Button'
import { PromptSaveIcon } from '@/features/modification/PromptSaveIcon'
import { UseFormReturn } from 'react-hook-form'
import { type ModificationLaunchMode, type ModifyFormValues, type PromptTemplate } from '@/pages/modify/modify.types'

type PromptFieldsProps = {
  applyPromptToAll: boolean
  onApplyTemplate: (template: PromptTemplate) => void
  form: UseFormReturn<ModifyFormValues>
  launchMode: ModificationLaunchMode
  negativePromptValue: string
  onApplyPromptToAllChange: (value: boolean) => void
  onNegativePromptChange: (value: string) => void
  onPromptChange: (value: string) => void
  onSamPromptChange: (value: string) => void
  onSaveTemplate: (scope: PromptTemplate['scope']) => void
  samPromptValue: string
  selectionTemplates: PromptTemplate[]
  sourceClassName: string
  textTemplates: PromptTemplate[]
}

const EMPTY_TEMPLATE_VALUE = '__none__'
const NO_TEMPLATES_VALUE = '__empty__'

export function PromptFields({
  applyPromptToAll,
  onApplyTemplate,
  form,
  launchMode,
  negativePromptValue,
  onApplyPromptToAllChange,
  onNegativePromptChange,
  onPromptChange,
  onSamPromptChange,
  onSaveTemplate,
  samPromptValue,
  selectionTemplates,
  sourceClassName,
  textTemplates,
}: PromptFieldsProps) {
  const promptRegister = form.register('prompt', {
    required: true,
    onChange: (event) => onPromptChange(event.target.value),
  })

  return (
    <div className="modification-prompts">
      <label className="generation-form__group modification-prompts__field modification-prompts__field--main">
        <span className="generation-form__label modification-prompts__label-row">
          <span>Промпт модификации</span>
          <span className="modification-prompts__field-actions">
            <select
              aria-label="Выбрать текстовый шаблон"
              className="modification-prompts__template-select"
              defaultValue={textTemplates.length > 0 ? EMPTY_TEMPLATE_VALUE : NO_TEMPLATES_VALUE}
              disabled={textTemplates.length === 0}
              onChange={(event) => {
                const selectedId = event.target.value
                if (selectedId === EMPTY_TEMPLATE_VALUE || selectedId === NO_TEMPLATES_VALUE) {
                  return
                }
                const template = textTemplates.find((item) => item.id === selectedId)
                if (template) {
                  onApplyTemplate(template)
                }
                event.currentTarget.value = EMPTY_TEMPLATE_VALUE
              }}
            >
              {textTemplates.length > 0 ? <option value={EMPTY_TEMPLATE_VALUE}>Шаблон</option> : <option value={NO_TEMPLATES_VALUE}>Нет шаблонов</option>}
              {textTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <Button
              aria-label="Сохранить текстовый шаблон"
              className="modification-prompts__save-button"
              onClick={() => onSaveTemplate('text')}
              title="Сохранить текстовый шаблон"
              type="button"
              variant="ghost"
            >
              <PromptSaveIcon />
            </Button>
            {launchMode === 'batch' ? (
            <span className="modification-prompts__checkbox">
              <input
                checked={applyPromptToAll}
                onChange={(event) => onApplyPromptToAllChange(event.target.checked)}
                type="checkbox"
              />
              <span>Применить ко всем</span>
            </span>
            ) : null}
          </span>
        </span>
        <textarea
          className="generation-form__textarea modification-prompts__input"
          placeholder={`Опиши, какую вариацию нужно получить для ${sourceClassName}. Поддерживается placeholder {className} в шаблонах.`}
          {...promptRegister}
        />
      </label>

      <label className="generation-form__group modification-prompts__field">
        <span className="generation-form__label modification-prompts__label-row">
          <span>Negative prompt</span>
          <Button
            aria-label="Сохранить текстовый шаблон"
            className="modification-prompts__save-button"
            onClick={() => onSaveTemplate('text')}
            title="Сохранить текстовый шаблон"
            type="button"
            variant="ghost"
          >
            <PromptSaveIcon />
          </Button>
        </span>
        <textarea
          className="generation-form__textarea modification-prompts__input"
          onChange={(event) => onNegativePromptChange(event.target.value)}
          placeholder="Опиши, чего не должно быть в результате."
          value={negativePromptValue}
        />
      </label>

      <label className="generation-form__group modification-prompts__field">
        <span className="generation-form__label modification-prompts__label-row">
          <span>SAM prompt</span>
          <select
            aria-label="Выбрать selection шаблон"
            className="modification-prompts__template-select"
            defaultValue={selectionTemplates.length > 0 ? EMPTY_TEMPLATE_VALUE : NO_TEMPLATES_VALUE}
            disabled={selectionTemplates.length === 0}
            onChange={(event) => {
              const selectedId = event.target.value
              if (selectedId === EMPTY_TEMPLATE_VALUE || selectedId === NO_TEMPLATES_VALUE) {
                return
              }
              const template = selectionTemplates.find((item) => item.id === selectedId)
              if (template) {
                onApplyTemplate(template)
              }
              event.currentTarget.value = EMPTY_TEMPLATE_VALUE
            }}
          >
            {selectionTemplates.length > 0 ? <option value={EMPTY_TEMPLATE_VALUE}>Шаблон</option> : <option value={NO_TEMPLATES_VALUE}>Нет шаблонов</option>}
            {selectionTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <Button
            aria-label="Сохранить selection шаблон"
            className="modification-prompts__save-button"
            onClick={() => onSaveTemplate('selection')}
            title="Сохранить selection шаблон"
            type="button"
            variant="ghost"
          >
            <PromptSaveIcon />
          </Button>
        </span>
        <textarea
          className="generation-form__textarea modification-prompts__input"
          onChange={(event) => onSamPromptChange(event.target.value)}
          placeholder="Опиши область для текстовой сегментации, если хочешь использовать SAM по тексту вместо полигона."
          value={samPromptValue}
        />
      </label>
    </div>
  )
}
