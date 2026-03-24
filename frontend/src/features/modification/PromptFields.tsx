import { UseFormReturn } from 'react-hook-form'
import { type ModifyFormValues } from '@/pages/modify/modify.types'

type PromptFieldsProps = {
  applyPromptToAll: boolean
  form: UseFormReturn<ModifyFormValues>
  negativePromptValue: string
  onApplyPromptToAllChange: (value: boolean) => void
  onNegativePromptChange: (value: string) => void
  onPromptChange: (value: string) => void
  onSamPromptChange: (value: string) => void
  samPromptValue: string
}

export function PromptFields({
  applyPromptToAll,
  form,
  negativePromptValue,
  onApplyPromptToAllChange,
  onNegativePromptChange,
  onPromptChange,
  onSamPromptChange,
  samPromptValue,
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
          <span className="modification-prompts__checkbox">
            <input
              checked={applyPromptToAll}
              onChange={(event) => onApplyPromptToAllChange(event.target.checked)}
              type="checkbox"
            />
            <span>Применить ко всем</span>
          </span>
        </span>
        <textarea
          className="generation-form__textarea modification-prompts__input"
          placeholder="Опиши, какую вариацию нужно получить на основе этого изображения."
          {...promptRegister}
        />
      </label>

      <label className="generation-form__group modification-prompts__field">
        <span className="generation-form__label">Negative prompt</span>
        <textarea
          className="generation-form__textarea modification-prompts__input"
          onChange={(event) => onNegativePromptChange(event.target.value)}
          placeholder="Опиши, чего не должно быть в результате."
          value={negativePromptValue}
        />
      </label>

      <label className="generation-form__group modification-prompts__field">
        <span className="generation-form__label">SAM prompt</span>
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
