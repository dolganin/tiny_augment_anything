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
    <label className="modification-mode-toggle">
      <span className="modification-mode-toggle__label">Режим</span>
      <select
        className="modification-mode-toggle__select"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as ModificationMode)}
        value={mode}
      >
        <option value="inpaint">Inpaint</option>
        <option value="full">Full remodification</option>
      </select>
    </label>
  )
}
