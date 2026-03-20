import { PageFrame } from '@/shared/ui/layouts/PageFrame'

export function MetricsPage() {
  return (
    <PageFrame
      title="Метрики по классам"
      description="Экран двух визуализаций: Recall слева и Precision справа после завершения обучения."
    >
      <div className="info-card">
        <p className="info-card__text">
          Метрики будут строиться столбцами с отдельной цветовой логикой для Precision и Recall.
        </p>
      </div>
    </PageFrame>
  )
}
