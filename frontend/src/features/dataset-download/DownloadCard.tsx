import { Button } from '@/shared/ui/buttons/Button'
import '@/features/generation-review/review.css'

type DownloadCardProps = {
  downloadUrl: string
}

export function DownloadCard({ downloadUrl }: DownloadCardProps) {
  return (
    <section className="download-card">
      <p className="info-card__text">
        Архив уже подготовлен. Скачивание идёт сразу по готовому ресурсу без дополнительного ожидания.
      </p>
      <a href={downloadUrl}>
        <Button>Скачать итоговый датасет</Button>
      </a>
    </section>
  )
}
