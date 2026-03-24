import { Button } from '@/shared/ui/buttons/Button'
import { PromptSaveIcon } from '@/features/modification/PromptSaveIcon'
import { UseFormReturn } from 'react-hook-form'
import {
  type ModificationLaunchMode,
  type ModifyFormValues,
  type NegativePromptTemplate,
  type PromptTemplate,
} from '@/pages/modify/modify.types'

type PromptFieldsProps = {
  applyPromptToAll: boolean
  onApplyTemplate: (template: PromptTemplate) => void
  form: UseFormReturn<ModifyFormValues>
  launchMode: ModificationLaunchMode
  loraAdapters: Array<{ adapterPath: string; displayName: string }>
  negativeTemplates: NegativePromptTemplate[]
  negativePromptValue: string
  onApplyPromptToAllChange: (value: boolean) => void
  onLoraChange: (value: string) => void
  onNegativePromptChange: (value: string) => void
  onPromptChange: (value: string) => void
  onSaveNegativeTemplate: () => void
  onSaveTemplate: (scope: PromptTemplate['scope']) => void
  selectedLoraPath: string
  sourceClassName: string
  textTemplates: PromptTemplate[]
}

const EMPTY_TEMPLATE_VALUE = '__none__'
const NO_TEMPLATES_VALUE = '__empty__'

function resolveDefaultValue(items: Array<{ id: string }>) {
  return items.length > 0 ? EMPTY_TEMPLATE_VALUE : NO_TEMPLATES_VALUE
}

export function PromptFields({
  applyPromptToAll,
  onApplyTemplate,
  form,
  launchMode,
  loraAdapters,
  negativeTemplates,
  negativePromptValue,
  onApplyPromptToAllChange,
  onLoraChange,
  onNegativePromptChange,
  onPromptChange,
  onSaveNegativeTemplate,
  onSaveTemplate,
  selectedLoraPath,
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
            aria-label="Сохранить negative шаблон"
            className="modification-prompts__save-button"
            onClick={onSaveNegativeTemplate}
            title="Сохранить negative шаблон"
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
          defaultValue={resolveDefaultValue(negativeTemplates)}
          disabled={negativeTemplates.length === 0}
          onChange={(event) => {
            const selectedId = event.target.value
            if (selectedId === EMPTY_TEMPLATE_VALUE || selectedId === NO_TEMPLATES_VALUE) {
              return
            }
            const template = negativeTemplates.find((item) => item.id === selectedId)
            if (template) {
              onNegativePromptChange(template.text)
            }
            event.currentTarget.value = EMPTY_TEMPLATE_VALUE
          }}
        >
          {negativeTemplates.length > 0 ? <option value={EMPTY_TEMPLATE_VALUE}>Выбрать шаблон negative prompt</option> : <option value={NO_TEMPLATES_VALUE}>Нет шаблонов negative prompt</option>}
          {negativeTemplates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>

      <label className="generation-form__group modification-prompts__field">
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
  )
}
