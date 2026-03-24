import { type DatasetCatalogItem } from '@/shared/types/workflow'

export type DatasetUploadPanelProps = {
  navigateTo?: string
  openOnImportComplete?: boolean
  onProjectChange?: (project: DatasetCatalogItem | null) => void
  compact?: boolean
}

export type PendingImportState = {
  sessionId: string
  datasetId: string
  datasetName: string
  jobId: string
}
