import { PageFrame } from '@/shared/ui/layouts/PageFrame'

export function ClassifierTrainPage() {
  return (
    <PageFrame
      title="Обучение классификатора"
      description="Экран ожидания и логов для финального хука обучения классификационной модели."
    >
      <div className="info-card">
        <p className="info-card__text">Здесь будет анимированный индикатор процесса и поток логов через WebSocket.</p>
      </div>
    </PageFrame>
  )
}
