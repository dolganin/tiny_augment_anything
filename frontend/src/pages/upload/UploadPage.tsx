import { PageFrame } from '@/shared/ui/layouts/PageFrame'

export function UploadPage() {
  return (
    <PageFrame
      title="Загрузка датасета"
      description="Стартовая точка workflow. Здесь будет загрузка zip-архива, запуск валидации и создание рабочей сессии."
      aside={<UploadAside />}
    >
      <div className="info-card">
        <p className="info-card__text">
          Каркас готов. Следующим этапом сюда добавляется upload-зона, loader обработки и модалка ошибок.
        </p>
      </div>
    </PageFrame>
  )
}

function UploadAside() {
  return (
    <div className="info-card">
      <p className="info-card__text">Принимается только архив `.zip`.</p>
      <p className="info-card__text">После валидации интерфейс переводит пользователя к статистике классов.</p>
    </div>
  )
}
