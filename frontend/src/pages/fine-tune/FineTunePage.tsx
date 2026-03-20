import { PageFrame } from '@/shared/ui/layouts/PageFrame'

export function FineTunePage() {
  return (
    <PageFrame
      title="Дообучение диффузионной модели"
      description="На этом экране появится выбор запуска fine-tune и поток логов через WebSocket."
      aside={<FineTuneAside />}
    >
      <div className="info-card">
        <p className="info-card__text">
          Если пользователь пропускает fine-tune, интерфейс должен ограничить дальнейший выбор только режимом модификации.
        </p>
      </div>
    </PageFrame>
  )
}

function FineTuneAside() {
  return (
    <div className="info-card">
      <p className="info-card__text">Состояние долгой задачи будет восстанавливаться после перезагрузки страницы.</p>
    </div>
  )
}
