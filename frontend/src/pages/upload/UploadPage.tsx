import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { DatasetUploadPanel } from '@/features/dataset-upload/DatasetUploadPanel'

export function UploadPage() {
  return (
    <PageFrame title="Загрузка датасета">
      <DatasetUploadPanel openOnImportComplete />
    </PageFrame>
  )
}
