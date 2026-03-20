import { PageFrame } from '@/shared/ui/layouts/PageFrame'

export function ModifyPage() {
  return (
    <PageFrame
      title="Модификация изображения"
      description="Экран случайного изображения из выбранных классов и настроек модификации."
    >
      <div className="info-card">
        <p className="info-card__text">
          Бэкенд будет отдавать путь внутри контейнера, а фронтенд должен преобразовать его в корректный ресурс для отображения.
        </p>
      </div>
    </PageFrame>
  )
}
