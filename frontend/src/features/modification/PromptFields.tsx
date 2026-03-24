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
  onSaveTemplate: (scope: PromptTemplate['scope']) => void
  sourceClassName: string
  textTemplates: PromptTemplate[]
}

const EMPTY_TEMPLATE_VALUE = '__none__'
const NO_TEMPLATES_VALUE = '__empty__'

function resolveDefaultValue(items: PromptTemplate[]) {
  return items.length > 0 ? EMPTY_TEMPLATE_VALUE : NO_TEMPLATES_VALUE
}

export function PromptFields({
  applyPromptToAll,
  onApplyTemplate,
  form,
  launchMode,
  negativePromptValue,
  onApplyPromptToAllChange,
  onNegativePromptChange,
  onPromptChange,
  onSaveTemplate,
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
        <select
          aria-label="Выбрать шаблон для промпта модификации"
          className="modification-prompts__template-select modification-prompts__template-select--below"
          defaultValue={resolveDefaultValue(textTemplates)}
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
          {textTemplates.length > 0 ? <option value={EMPTY_TEMPLATE_VALUE}>Выбрать шаблон промпта</option> : <option value={NO_TEMPLATES_VALUE}>Нет шаблонов промпта</option>}
          {textTemplates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
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
        <select
          aria-label="Выбрать шаблон для negative prompt"
          className="modification-prompts__template-select modification-prompts__template-select--below"
          defaultValue={resolveDefaultValue(textTemplates)}
          disabled={textTemplates.length === 0}
          onChange={(event) => {
            const selectedId = event.target.value
            if (selectedId === EMPTY_TEMPLATE_VALUE || selectedId === NO_TEMPLATES_VALUE) {
              return
            }
            const template = textTemplates.find((item) => item.id === selectedId)
            if (template?.scope === 'text' && template.negativeText) {
              onNegativePromptChange(template.negativeText)
            }
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
    </div>
  )
}
