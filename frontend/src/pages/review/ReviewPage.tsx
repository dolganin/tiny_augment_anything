import { PageFrame } from '@/shared/ui/layouts/PageFrame'

export function ReviewPage() {
  return (
    <PageFrame
      title="Отбор результатов"
      description="Пошаговый просмотр результатов с подтверждением или удалением по одному изображению."
    >
      <div className="info-card">
        <p className="info-card__text">
          После отклонения фронтенд должен сразу отправлять запрос на удаление файла, а успешные элементы переводить к обучению классификатора.
        </p>
      </div>
    </PageFrame>
  )
}
