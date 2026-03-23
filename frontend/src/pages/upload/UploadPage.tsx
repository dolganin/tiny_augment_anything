import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { DatasetUploadPanel } from '@/features/dataset-upload/DatasetUploadPanel'

export function UploadPage() {
  return (
    <PageFrame
      title="Загрузка датасета"
      description="Загрузи zip-архив с датасетом. После успешной валидации интерфейс создаст рабочую сессию и откроет статистику редких классов."
    >
      <DatasetUploadPanel openOnImportComplete />
    </PageFrame>
  )
}
