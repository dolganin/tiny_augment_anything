import { PageFrame } from '@/shared/ui/layouts/PageFrame'

export function GeneratePage() {
  return (
    <PageFrame
      title="Генерация по промпту"
      description="Экран текстового промпта и редактируемой конфигурации на основе YAML-параметров от бэкенда."
    >
      <div className="info-card">
        <p className="info-card__text">
          Здесь появятся форма промпта, текстовые поля конфигурации и управление объёмом генерации.
        </p>
      </div>
    </PageFrame>
  )
}
