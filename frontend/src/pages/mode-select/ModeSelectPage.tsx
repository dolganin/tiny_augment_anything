import { PageFrame } from '@/shared/ui/layouts/PageFrame'

export function ModeSelectPage() {
  return (
    <PageFrame
      title="Выбор режима работы"
      description="После завершения или пропуска fine-tune пользователь выбирает генерацию новых изображений или модификацию."
    >
      <div className="info-card">
        <p className="info-card__text">Здесь будет модальный выбор одного из доступных режимов.</p>
      </div>
    </PageFrame>
  )
}
