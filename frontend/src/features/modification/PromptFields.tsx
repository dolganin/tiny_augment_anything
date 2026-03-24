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
  onDeleteTemplate: (templateId: string) => void
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

export function PromptFields({
  applyPromptToAll,
  onApplyTemplate,
  form,
  launchMode,
  negativePromptValue,
  onDeleteTemplate,
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
        {textTemplates.length > 0 ? (
          <div className="modification-prompts__template-list">
            {textTemplates.map((template) => (
              <div className="modification-prompts__template-chip" key={template.id}>
                <button onClick={() => onApplyTemplate(template)} type="button">
                  {template.name}
                </button>
                {template.id.startsWith('user:') ? (
                  <button
                    aria-label={`Удалить шаблон ${template.name}`}
                    className="modification-prompts__template-delete"
                    onClick={() => onDeleteTemplate(template.id)}
                    type="button"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
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
        {selectionTemplates.length > 0 ? (
          <div className="modification-prompts__template-list">
            {selectionTemplates.map((template) => (
              <div className="modification-prompts__template-chip" key={template.id}>
                <button onClick={() => onApplyTemplate(template)} type="button">
                  {template.name}
                </button>
                {template.id.startsWith('user:') ? (
                  <button
                    aria-label={`Удалить шаблон ${template.name}`}
                    className="modification-prompts__template-delete"
                    onClick={() => onDeleteTemplate(template.id)}
                    type="button"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
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
