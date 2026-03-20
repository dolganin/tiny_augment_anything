export const workflowStages = [
  'upload',
  'dataset-stats',
  'fine-tune',
  'mode-select',
  'generate',
  'modify',
  'review',
  'classifier-train',
  'metrics',
  'download',
] as const

export type WorkflowStage = (typeof workflowStages)[number]

export type WorkflowMode = 'generate' | 'modify' | null

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
}

export type WorkflowMetrics = {
  precision: MetricPoint[]
  recall: MetricPoint[]
}
