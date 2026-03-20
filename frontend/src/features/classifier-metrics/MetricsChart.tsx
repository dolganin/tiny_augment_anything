import { MetricPoint } from '@/shared/types/workflow'
import '@/features/classifier-metrics/metrics.css'

type MetricsChartProps = {
  title: string
  tone: 'precision' | 'recall'
  items: MetricPoint[]
}

export function MetricsChart({ title, tone, items }: MetricsChartProps) {
  const maxValue = Math.max(...items.map((item) => item.value), 1)

  return (
    <section className={`metrics-chart metrics-chart--${tone}`}>
      <h3 className="metrics-chart__title">{title}</h3>
      <div className="metrics-chart__body">
        {items.map((item) => (
          <div className="metrics-chart__row" key={item.name}>
            <div className="metrics-chart__label">{item.name}</div>
            <div className="metrics-chart__track">
              <div
                className="metrics-chart__bar"
                style={{ width: `${Math.max((item.value / maxValue) * 100, 4)}%` }}
              />
            </div>
            <div className="metrics-chart__value">{item.value.toFixed(3)}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
