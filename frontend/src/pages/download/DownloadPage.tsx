import { PageFrame } from '@/shared/ui/layouts/PageFrame'

export function DownloadPage() {
  return (
    <PageFrame
      title="Скачивание датасета"
      description="Итоговый экран выгрузки готового zip-архива после завершения всего pipeline."
    >
      <div className="info-card">
        <p className="info-card__text">
          Ссылка на скачивание должна оставаться валидной, пока контейнер продолжает работать.
        </p>
      </div>
    </PageFrame>
  )
}
