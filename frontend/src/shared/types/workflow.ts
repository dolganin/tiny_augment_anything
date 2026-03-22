export type WorkflowStage =
  | 'upload'
  | 'dataset-stats'
  | 'fine-tune'
  | 'mode-select'
  | 'generate'
  | 'modify'
  | 'review'
  | 'classifier-train'
  | 'metrics'

export const workflowStages: WorkflowStage[] = [
  'upload',
  'dataset-stats',
  'fine-tune',
  'modify',
  'review',
  'classifier-train',
  'metrics',
]

export type WorkflowMode = 'generate' | 'modify' | null

export const workflowStageLabels: Record<WorkflowStage, string> = {
  upload: 'Загрузка',
  'dataset-stats': 'Статистика',
  'fine-tune': 'Инициализация',
  'mode-select': 'Режим',
  generate: 'Генерация',
  modify: 'Модификация',
  review: 'Отбор',
  'classifier-train': 'Классификатор',
  metrics: 'Метрики',
}

export const workflowStagePaths: Record<WorkflowStage, string> = {
  upload: '/upload',
  'dataset-stats': '/dataset/stats',
  'fine-tune': '/diffusion/fine-tune',
  'mode-select': '/mode',
  generate: '/generate',
  modify: '/modify',
  review: '/review',
  'classifier-train': '/classifier/train',
  metrics: '/metrics',
}

export type DatasetClassStat = {
  name: string
  count: number
}

export type MetricPoint = {
  name: string
  value: number
}

export type GenerationAsset = {
  id: string
  previewUrl: string
  sourceUrl?: string
  className: string
  referenceUrls: string[]
}

export type WorkflowMetrics = {
  precision: MetricPoint[]
  recall: MetricPoint[]
}

export type DatasetCatalogTask = {
  jobId: string
  taskType: string
  status: string
  progress: number
  message: string | null
  errorMessage: string | null
}

export type DatasetStatus = 'uploading' | 'importing' | 'ready' | 'error'

export type DatasetCatalogItem = {
  datasetId: string
  datasetName: string
  status: DatasetStatus
  sessionId: string
  workflowStage: WorkflowStage
  currentMode: WorkflowMode
  fineTuneEnabled: boolean
  fineTuneResolved: boolean
  versionIndex: number
  assetCount: number
  updatedAt: string
  previewUrls: string[]
  recentTasks: DatasetCatalogTask[]
  isPendingLocal?: boolean
}

export type GlobalJob = {
  jobId: string
  sessionId: string
  datasetId: string | null
  datasetName: string | null
  taskType: string
  status: string
  progress: number
  message: string | null
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  heartbeatAt: string | null
}
