export type WorkflowStage =
  | 'upload'
  | 'dataset-stats'
  | 'modify'
  | 'review'
  | 'classifier-train'
  | 'metrics'

export const workflowStages: WorkflowStage[] = [
  'upload',
  'dataset-stats',
  'modify',
  'review',
  'classifier-train',
  'metrics',
]

export const datasetWorkflowStages: WorkflowStage[] = workflowStages.filter((stage) => stage !== 'upload')

export type WorkflowMode = 'generate' | 'modify' | null

export const workflowStageLabels: Record<WorkflowStage, string> = {
  upload: 'Загрузка',
  'dataset-stats': 'Статистика',
  modify: 'Модификация',
  review: 'Отбор',
  'classifier-train': 'Классификатор',
  metrics: 'Метрики',
}

export const workflowStagePaths: Record<WorkflowStage, string> = {
  upload: '/datasets',
  'dataset-stats': '/dataset/stats',
  modify: '/modify',
  review: '/review',
  'classifier-train': '/classifier/train',
  metrics: '/metrics',
}

export type DatasetClassStat = {
  name: string
  count: number
}

export type ClassTargets = Record<string, number>

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

export type ClassifierSplitClass = {
  className: string
  originalCount: number
  syntheticCount: number
  trainCount: number
  valCount: number
}

export type ClassifierSplitSummary = {
  classCount: number
  trainCount: number
  valCount: number
  perClass: ClassifierSplitClass[]
  error: string | null
}

export type TrainedClassifierModel = {
  id: string
  taskId: string
  datasetVersionId: string
  status: string
  modelKey: string | null
  classNames: string[]
  hparams: Record<string, number>
  pretrainedWeightsPath: string | null
  metrics: WorkflowMetrics | null
  createdAt: string | null
  finishedAt: string | null
}

export type ModificationSourceAsset = {
  assetId: string
  assetUrl: string
  className: string
}

export type DiffusionLoraAdapter = {
  fileName: string
  adapterPath: string
  sizeBytes: number
  updatedAt: string
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
