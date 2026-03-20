import { DatasetClassStat } from '@/shared/types/workflow'
import '@/features/dataset-stats/dataset-stats.css'

type ClassDistributionChartProps = {
  items: DatasetClassStat[]
}

export function ClassDistributionChart({ items }: ClassDistributionChartProps) {
  const maxCount = Math.max(...items.map((item) => item.count), 1)

  return (
    <div className="class-chart" role="img" aria-label="Распределение редких классов">
      {items.map((item) => {
        const height = Math.max((item.count / maxCount) * 100, 12)

        return (
          <div className="class-chart__row" key={item.name}>
            <div className="class-chart__bar-wrap">
              <div className="class-chart__bar" style={{ height: `${height}%` }} />
              <span className="class-chart__value">{item.count}</span>
            </div>
            <span className="class-chart__label">{item.name}</span>
          </div>
        )
      })}
    </div>
  )
}
