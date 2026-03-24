import { Button } from '@/shared/ui/buttons/Button'

export type ModificationMode = 'inpaint' | 'full'

type ModificationModeToggleProps = {
  disabled?: boolean
  mode: ModificationMode
  onChange: (mode: ModificationMode) => void
}

export function ModificationModeToggle({
  disabled = false,
  mode,
  onChange,
}: ModificationModeToggleProps) {
  return (
    <div className="modification-mode-toggle" role="radiogroup" aria-label="Режим модификации">
      <Button
        aria-checked={mode === 'inpaint'}
        className={mode === 'inpaint' ? 'modification-mode-toggle__button--active' : undefined}
        disabled={disabled}
        onClick={() => onChange('inpaint')}
        role="radio"
        type="button"
        variant={mode === 'inpaint' ? 'primary' : 'ghost'}
      >
        Inpaint modification
      </Button>
      <Button
        aria-checked={mode === 'full'}
        className={mode === 'full' ? 'modification-mode-toggle__button--active' : undefined}
        disabled={disabled}
        onClick={() => onChange('full')}
        role="radio"
        type="button"
        variant={mode === 'full' ? 'primary' : 'ghost'}
      >
        Full remodification
      </Button>
    </div>
  )
}
