import { Link } from 'react-router-dom'
import { Button } from '@/shared/ui/buttons/Button'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'

export function NotFoundPage() {
  return (
    <PageFrame
      title="Маршрут не найден"
      description="Интерфейс ожидает только сценарные переходы внутри workflow."
    >
      <div className="info-card">
        <p className="info-card__text">
          Запрошенный экран не существует или ещё не должен быть доступен на текущем этапе.
        </p>
        <Link to="/upload">
          <Button>Вернуться к загрузке</Button>
        </Link>
      </div>
    </PageFrame>
  )
}
