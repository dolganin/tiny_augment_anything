import clsx from 'clsx'
import { GenerationConfigResponse } from '@/shared/api/contracts'
import '@/features/generation-config/generation-config.css'

type GenerationConfigFieldsProps = {
  className?: string
  fields: GenerationConfigResponse['fields']
  values: Record<string, string>
  onChange: (key: string, value: string) => void
}

export function GenerationConfigFields({
  className,
  fields,
  values,
  onChange,
}: GenerationConfigFieldsProps) {
  return (
    <div className={clsx('generation-fields', className)}>
      {fields.map((field) => (
        <label className="generation-fields__item" key={field.key}>
          <span className="generation-fields__label">{field.label}</span>
          {field.type === 'enum' && field.options?.length ? (
            <select
              className="generation-fields__control"
              onChange={(event) => onChange(field.key, event.target.value)}
              value={values[field.key] ?? field.value}
            >
              {field.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="generation-fields__control"
              onChange={(event) => onChange(field.key, event.target.value)}
              type="text"
              value={values[field.key] ?? field.value}
            />
          )}
        </label>
      ))}
    </div>
  )
}
