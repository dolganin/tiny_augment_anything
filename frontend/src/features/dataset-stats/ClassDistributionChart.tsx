import clsx from 'clsx'
import { DatasetClassStat } from '@/shared/types/workflow'

type ClassDistributionChartProps = {
  items: DatasetClassStat[]
  selectedClasses: string[]
  onToggle: (className: string) => void
}

export function ClassDistributionChart(props: ClassDistributionChartProps) {
  const { items, onToggle, selectedClasses } = props
  const maxCount = Math.max(...items.map((item) => item.count), 1)

  return (
    <div className="class-chart" role="list" aria-label="Распределение редких классов">
      {items.map((item) => {
        const width = Math.max((item.count / maxCount) * 100, 6)
        const isSelected = selectedClasses.includes(item.name)

        return (
          <button
            aria-pressed={isSelected}
            className={clsx('class-chart__row', isSelected && 'class-chart__row--selected')}
            key={item.name}
            onClick={() => onToggle(item.name)}
            type="button"
          >
            <div className="class-chart__meta">
              <span className="class-chart__label">{item.name}</span>
              <span className="class-chart__value">{item.count}</span>
            </div>
            <div className="class-chart__track">
              <div className="class-chart__bar" style={{ width: `${width}%` }} />
            </div>
          </button>
        )
      })}
    </div>
  )
}
