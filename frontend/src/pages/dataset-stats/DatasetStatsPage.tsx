import { PageFrame } from '@/shared/ui/layouts/PageFrame'

export function DatasetStatsPage() {
  return (
    <PageFrame
      title="Статистика классов"
      description="Экран визуализации редких классов, их отбора и перехода к следующему шагу workflow."
      aside={<StatsAside />}
    >
      <div className="info-card">
        <p className="info-card__text">
          Здесь появится диаграмма без осей и интерактивный список классов с ограничением до 10 редких классов.
        </p>
      </div>
    </PageFrame>
  )
}

function StatsAside() {
  return (
    <div className="info-card">
      <p className="info-card__text">Переход вперёд будет разрешён только при выборе хотя бы одного класса.</p>
    </div>
  )
}
