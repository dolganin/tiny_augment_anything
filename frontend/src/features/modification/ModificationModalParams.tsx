import { useState } from 'react'
import { Button } from '@/shared/ui/buttons/Button'
import { GenerationConfigFields } from '@/features/generation-config/GenerationConfigFields'
import { ModificationMode, ModificationModeToggle } from '@/features/modification/ModificationModeToggle'

type ConfigField = {
  key: string
  label: string
  type: string
  value: string
  options?: string[]
}

type ModificationModalParamsProps = {
  applyMaskToAll: boolean
  fieldValues: Record<string, string>
  mode: ModificationMode
  onFieldValueChange: (key: string, value: string) => void
  onMaskModeChange: (value: boolean) => void
  onModeChange: (mode: ModificationMode) => void
  priorityFields: ConfigField[]
  selectedSourceCount: number
  secondaryFields: ConfigField[]
  totalTargetCount: number
}

export function ModificationModalParams({
  applyMaskToAll,
  fieldValues,
  mode,
  onFieldValueChange,
  onMaskModeChange,
  onModeChange,
  priorityFields,
  selectedSourceCount,
  secondaryFields,
  totalTargetCount,
}: ModificationModalParamsProps) {
  const [secondaryOpen, setSecondaryOpen] = useState(false)

  return (
    <aside className="modification-modal__params-column">
      <section className="modification-modal__panel">
        <div className="modification-modal__summary">
          <span className="modification-modal__summary-label">План</span>
          <strong className="modification-modal__summary-value">{totalTargetCount}</strong>
        </div>
        <div className="modification-modal__summary">
          <span className="modification-modal__summary-label">Источники</span>
          <strong className="modification-modal__summary-value">{selectedSourceCount}</strong>
        </div>
        <ModificationModeToggle mode={mode} onChange={onModeChange} />
        <label className="modification-prompts__checkbox">
          <input
            checked={applyMaskToAll}
            onChange={(event) => onMaskModeChange(event.target.checked)}
            type="checkbox"
          />
          <span>Общая маска для всего batch</span>
        </label>
      </section>

      {priorityFields.length > 0 ? (
        <section className="modification-modal__panel">
          <GenerationConfigFields
            className="modification-modal__fields"
            fields={priorityFields}
            onChange={onFieldValueChange}
            values={fieldValues}
          />
        </section>
      ) : null}

      {secondaryFields.length > 0 ? (
        <section className="modification-modal__panel">
          <div className="modification-modal__section-head modification-modal__section-head--spread">
            <h3 className="modification-modal__section-title">Дополнительные параметры</h3>
            <Button onClick={() => setSecondaryOpen((current) => !current)} type="button" variant="ghost">
              {secondaryOpen ? 'Скрыть' : 'Показать'}
            </Button>
          </div>
          {secondaryOpen ? (
            <GenerationConfigFields
              className="modification-modal__fields"
              fields={secondaryFields}
              onChange={onFieldValueChange}
              values={fieldValues}
            />
          ) : null}
        </section>
      ) : null}
    </aside>
  )
}
