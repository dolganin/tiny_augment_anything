import { z } from 'zod'

export const apiTaskStatusSchema = z.enum(['idle', 'pending', 'running', 'success', 'error', 'cancelled'])

export const apiErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
})

export const datasetClassStatSchema = z.object({
  name: z.string(),
  count: z.number().int().nonnegative(),
})

export const generationFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'enum']),
  options: z.array(z.string()).optional(),
})

export const generationAssetSchema = z.object({
  id: z.string(),
  previewPath: z.string(),
  sourcePath: z.string().optional(),
  className: z.string(),
})

export const metricsPointSchema = z.object({
  name: z.string(),
  value: z.number().min(0),
})

export const datasetUploadResponseSchema = z.object({
  sessionId: z.string(),
  datasetId: z.string(),
  datasetName: z.string().nullable().optional(),
  status: apiTaskStatusSchema,
  error: apiErrorSchema.nullable().optional(),
})

export const sessionSnapshotResponseSchema = z.object({
  sessionId: z.string(),
  datasetId: z.string().nullable().optional(),
  datasetName: z.string().nullable().optional(),
  selectedClasses: z.array(z.string()).default([]),
  currentMode: z.enum(['generate', 'modify']).nullable().optional(),
  fineTuneEnabled: z.boolean().default(false),
  fineTuneResolved: z.boolean().default(false),
  workflowStage: z
    .enum([
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
    ])
    .default('upload'),
})

export const datasetStatsResponseSchema = z.object({
  classes: z.array(datasetClassStatSchema),
})

export const selectedClassesPayloadSchema = z.object({
  classNames: z.array(z.string()).min(1),
})

export const taskStartedResponseSchema = z.object({
  jobId: z.string(),
  status: apiTaskStatusSchema,
})

export const generationConfigResponseSchema = z.object({
  fields: z.array(generationFieldSchema),
  sampleCount: z.number().int().positive().default(1),
})

export const generationStartPayloadSchema = z.object({
  prompt: z.string().min(1),
  sampleCount: z.number().int().positive(),
  config: z.record(z.string()),
})

export const modificationSourceResponseSchema = z.object({
  assetPath: z.string(),
  className: z.string(),
})

export const modificationStartPayloadSchema = z.object({
  sourcePath: z.string(),
  sampleCount: z.number().int().positive(),
  config: z.record(z.string()),
})

export const generationResultsResponseSchema = z.object({
  remainingCount: z.number().int().nonnegative(),
  targetCount: z.number().int().positive(),
  items: z.array(generationAssetSchema),
})

export const metricsResponseSchema = z.object({
  precision: z.array(metricsPointSchema),
  recall: z.array(metricsPointSchema),
})

export const downloadResponseSchema = z.object({
  downloadPath: z.string(),
})

export const workflowSocketEventSchema = z.object({
  type: z.enum([
    'session.updated',
    'fine_tune.progress',
    'generation.progress',
    'classifier.progress',
    'task.completed',
    'task.failed',
  ]),
  sessionId: z.string(),
  jobId: z.string().optional(),
  payload: z
    .object({
      stage: z.string().optional(),
      epoch: z.number().optional(),
      totalEpochs: z.number().optional(),
      loss: z.number().optional(),
      etaSeconds: z.number().optional(),
      message: z.string().optional(),
      progress: z.number().optional(),
    })
    .passthrough(),
})

export type DatasetUploadResponse = z.infer<typeof datasetUploadResponseSchema>
export type SessionSnapshotResponse = z.infer<typeof sessionSnapshotResponseSchema>
export type DatasetStatsResponse = z.infer<typeof datasetStatsResponseSchema>
export type GenerationConfigResponse = z.infer<typeof generationConfigResponseSchema>
export type GenerationResultsResponse = z.infer<typeof generationResultsResponseSchema>
export type MetricsResponse = z.infer<typeof metricsResponseSchema>
export type WorkflowSocketEvent = z.infer<typeof workflowSocketEventSchema>
