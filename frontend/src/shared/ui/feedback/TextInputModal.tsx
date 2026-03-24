import { useEffect, useState } from 'react'
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'

type TextInputModalProps = {
  confirmLabel?: string
  defaultValue?: string
  description?: string
  label: string
  onClose: () => void
  onConfirm: (value: string) => void | Promise<void>
  open: boolean
  placeholder?: string
  title: string
  confirmDisabled?: boolean
  isSubmitting?: boolean
  resetLabel?: string
  onReset?: () => void
}

export function TextInputModal({
  confirmDisabled = false,
  confirmLabel = 'Сохранить',
  defaultValue = '',
  description,
  label,
  onClose,
  onConfirm,
  open,
  placeholder,
  title,
  isSubmitting = false,
  onReset,
  resetLabel = 'Сбросить',
}: TextInputModalProps) {
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    if (!open) {
      return
    }
    setValue(defaultValue)
  }, [defaultValue, open])

  return (
    <Modal onClose={onClose} open={open} title={title}>
      <div className="generation-form generation-form--stacked">
        {description ? <p className="mode-card__text">{description}</p> : null}
        <label className="generation-form__group">
          <span className="generation-form__label">{label}</span>
          <input
            autoFocus
            className="generation-form__input"
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            type="text"
            value={value}
          />
        </label>
        <div className="modal__actions">
          {onReset ? (
            <Button
              disabled={isSubmitting}
              onClick={() => {
                setValue(defaultValue)
                onReset()
              }}
              type="button"
              variant="secondary"
            >
              {resetLabel}
            </Button>
          ) : null}
          <Button onClick={onClose} type="button" variant="ghost">
            Отмена
          </Button>
          <Button
            disabled={isSubmitting || confirmDisabled || !value.trim()}
            onClick={() => {
              void onConfirm(value.trim())
            }}
            type="button"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
