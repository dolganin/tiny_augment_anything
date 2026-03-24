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
  fieldValues: Record<string, string>
  mode: ModificationMode
  onFieldValueChange: (key: string, value: string) => void
  onModeChange: (mode: ModificationMode) => void
  priorityFields: ConfigField[]
  secondaryFields: ConfigField[]
  sourceClassName: string
  totalTargetCount: number
}

export function ModificationModalParams({
  fieldValues,
  mode,
  onFieldValueChange,
  onModeChange,
  priorityFields,
  secondaryFields,
  sourceClassName,
  totalTargetCount,
}: ModificationModalParamsProps) {
  const [secondaryOpen, setSecondaryOpen] = useState(false)

  return (
    <aside className="modification-modal__params-column">
      <div className="info-card">
        <p className="info-card__text">
          План генерации: <strong>{totalTargetCount}</strong> изображений суммарно.
        </p>
        <p className="info-card__text">
          Текущий источник: <strong>{sourceClassName}</strong>
        </p>
      </div>

      <section className="modification-modal__panel">
        <div className="modification-modal__section-head">
          <h3 className="modification-modal__section-title">Режим модификации</h3>
          <p className="modification-modal__section-copy">Inpaint использует полигон или SAM, full remodification меняет всё изображение.</p>
        </div>
        <ModificationModeToggle mode={mode} onChange={onModeChange} />
      </section>

      {priorityFields.length > 0 ? (
        <section className="modification-modal__panel">
          <div className="modification-modal__section-head">
            <h3 className="modification-modal__section-title">Основные параметры</h3>
          </div>
          <GenerationConfigFields fields={priorityFields} onChange={onFieldValueChange} values={fieldValues} />
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
            <GenerationConfigFields fields={secondaryFields} onChange={onFieldValueChange} values={fieldValues} />
          ) : null}
        </section>
      ) : null}
    </aside>
  )
}
