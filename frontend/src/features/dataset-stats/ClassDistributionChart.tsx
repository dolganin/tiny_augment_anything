import { DatasetClassStat } from '@/shared/types/workflow'

type ClassDistributionChartProps = {
  items: DatasetClassStat[]
}

export function ClassDistributionChart({ items }: ClassDistributionChartProps) {
  const maxCount = Math.max(...items.map((item) => item.count), 1)

  return (
    <div className="class-chart" role="img" aria-label="Распределение редких классов">
      {items.map((item) => {
        const width = Math.max((item.count / maxCount) * 100, 6)

        return (
          <div className="class-chart__row" key={item.name}>
            <div className="class-chart__meta">
              <span className="class-chart__label">{item.name}</span>
              <span className="class-chart__value">{item.count}</span>
            </div>
            <div className="class-chart__track">
              <div className="class-chart__bar" style={{ width: `${width}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
