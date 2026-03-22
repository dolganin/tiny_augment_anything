import clsx from 'clsx'
import { ChangeEvent } from 'react'
import { ClassTargets, DatasetClassStat } from '@/shared/types/workflow'

type ClassDistributionChartProps = {
  items: DatasetClassStat[]
  selectedClasses: string[]
  selectedClassTargets: ClassTargets
  onToggle: (className: string) => void
  onTargetChange: (className: string, value: number) => void
}

export function ClassDistributionChart(props: ClassDistributionChartProps) {
  const { items, onToggle, onTargetChange, selectedClasses, selectedClassTargets } = props
  const maxCount = Math.max(...items.map((item) => item.count), 1)

  const handleTargetChange = (className: string, event: ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation()
    onTargetChange(className, Math.max(1, Number(event.target.value) || 1))
  }

  return (
    <div className="class-chart" role="list" aria-label="Распределение редких классов">
      {items.map((item) => {
        const width = Math.max((item.count / maxCount) * 100, 6)
        const isSelected = selectedClasses.includes(item.name)

        return (
          <div className={clsx('class-chart__entry', isSelected && 'class-chart__entry--selected')} key={item.name}>
            <button
              aria-pressed={isSelected}
              className={clsx('class-chart__row', isSelected && 'class-chart__row--selected')}
              onClick={() => onToggle(item.name)}
              type="button"
            >
              <div className="class-chart__meta">
                <span className="class-chart__label">{item.name}</span>
                <span className="class-chart__value">{item.count} originals</span>
              </div>
              <div className="class-chart__track">
                <div className="class-chart__bar" style={{ width: `${width}%` }} />
              </div>
            </button>
            {isSelected ? (
              <label className="class-chart__target">
                <span className="class-chart__target-label">Сгенерировать для класса</span>
                <input
                  className="class-chart__target-input"
                  min={1}
                  onChange={(event) => handleTargetChange(item.name, event)}
                  type="number"
                  value={selectedClassTargets[item.name] ?? 1}
                />
              </label>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
