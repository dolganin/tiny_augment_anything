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
  sourcePath: z.string().nullable().optional(),
  className: z.string(),
  referencePreviewPaths: z.array(z.string()).default([]),
})

export const metricsPointSchema = z.object({
  name: z.string(),
  value: z.number().min(0),
})

export const datasetUploadResponseSchema = z.object({
  sessionId: z.string(),
  datasetId: z.string(),
  datasetName: z.string().nullable().optional(),
  jobId: z.string(),
  status: apiTaskStatusSchema,
  error: apiErrorSchema.nullable().optional(),
})

export const uploadInitResponseSchema = z.object({
  uploadId: z.string(),
  chunkSize: z.number().int().positive(),
  totalParts: z.number().int().positive(),
})

export const uploadStatusResponseSchema = z.object({
  uploadId: z.string(),
  fileName: z.string(),
  fileSize: z.number().int().positive(),
  chunkSize: z.number().int().positive(),
  totalParts: z.number().int().positive(),
  nextPart: z.number().int().nonnegative(),
  uploadedBytes: z.number().int().nonnegative(),
  progress: z.number().min(0).max(1),
})

export const sessionSnapshotResponseSchema = z.object({
  sessionId: z.string(),
  datasetId: z.string().nullable().optional(),
  datasetName: z.string().nullable().optional(),
  selectedClasses: z.array(z.string()).default([]),
  selectedClassTargets: z.record(z.number().int().positive()).default({}),
  currentMode: z.enum(['generate', 'modify']).nullable().optional(),
  fineTuneEnabled: z.boolean().default(false),
  fineTuneResolved: z.boolean().default(false),
  fineTuneJobId: z.string().nullable().optional(),
  generationJobId: z.string().nullable().optional(),
  classifierJobId: z.string().nullable().optional(),
  downloadPath: z.string().nullable().optional(),
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

export const datasetCatalogTaskSchema = z.object({
  jobId: z.string(),
  taskType: z.string(),
  status: apiTaskStatusSchema,
  progress: z.number().min(0).max(1),
  message: z.string().nullable(),
  errorMessage: z.string().nullable(),
})

export const datasetCatalogItemSchema = z.object({
  datasetId: z.string(),
  datasetName: z.string(),
  status: z.enum(['uploading', 'importing', 'ready', 'error']),
  sessionId: z.string(),
  workflowStage: sessionSnapshotResponseSchema.shape.workflowStage,
  currentMode: z.enum(['generate', 'modify']).nullable().optional(),
  fineTuneEnabled: z.boolean(),
  fineTuneResolved: z.boolean(),
  versionIndex: z.number().int().positive(),
  assetCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
  previewPaths: z.array(z.string()).default([]),
  recentTasks: z.array(datasetCatalogTaskSchema),
})

export const datasetsCatalogResponseSchema = z.object({
  items: z.array(datasetCatalogItemSchema),
})

export const globalJobSchema = z.object({
  jobId: z.string(),
  sessionId: z.string(),
  datasetId: z.string().nullable(),
  datasetName: z.string().nullable(),
  taskType: z.string(),
  status: apiTaskStatusSchema,
  progress: z.number().min(0).max(1),
  message: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  heartbeatAt: z.string().nullable(),
})

export const jobsResponseSchema = z.object({
  items: z.array(globalJobSchema),
})

export const selectedClassesPayloadSchema = z.object({
  classNames: z.array(z.string()).min(1),
  classTargets: z.record(z.number().int().positive()),
})

export const taskStartedResponseSchema = z.object({
  jobId: z.string(),
  status: apiTaskStatusSchema,
})

export const statusResponseSchema = z.object({
  status: z.literal('success'),
})

export const classifierWeightsUploadResponseSchema = z.object({
  status: z.literal('success'),
  fileName: z.string(),
  weightsPath: z.string(),
})

export const taskStatusResponseSchema = z.object({
  jobId: z.string(),
  status: apiTaskStatusSchema,
  progress: z.number().min(0).max(1).nullable(),
  message: z.string().nullable(),
  error: z.object({ message: z.string().optional() }).nullable().optional(),
  taskType: z.string(),
})

export const syncStateResponseSchema = z.object({
  status: z.literal('success'),
})

export const finalizeReviewPayloadSchema = z.object({
  nextStage: z.enum(['modify', 'classifier-train']),
})

export const finalizeReviewResponseSchema = z.object({
  status: z.literal('success'),
  approvedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  versionCreated: z.boolean(),
})

export const generationConfigResponseSchema = z.object({
  fields: z.array(generationFieldSchema),
  sampleCount: z.number().int().positive().default(1),
})

export const generationStartPayloadSchema = z.object({
  prompt: z.string().min(1),
  sampleCount: z.number().int().positive(),
  classTargets: z.record(z.number().int().positive()),
  config: z.record(z.string()),
})

export const modificationSourceResponseSchema = z.object({
  assetId: z.string(),
  previewPath: z.string(),
  className: z.string(),
  items: z
    .array(
      z.object({
        assetId: z.string(),
        previewPath: z.string(),
        className: z.string(),
      }),
    )
    .default([]),
})

export const modificationAreaPointSchema = z.tuple([z.number(), z.number()])

export const modificationStartPayloadSchema = z.object({
  prompt: z.string().min(1),
  sourceAssetId: z.string().min(1),
  sampleCount: z.number().int().positive(),
  classTargets: z.record(z.number().int().positive()),
  config: z.record(z.string()),
  areaPoints: z.array(modificationAreaPointSchema).min(3).optional(),
})

export const generationResultsResponseSchema = z.object({
  remainingCount: z.number().int().nonnegative(),
  targetCount: z.number().int().positive(),
  items: z.array(generationAssetSchema),
})

export const metricsResponseSchema = z.object({
  ready: z.boolean().default(true),
  precision: z.array(metricsPointSchema),
  recall: z.array(metricsPointSchema),
})

export const classifierSplitClassSchema = z.object({
  className: z.string(),
  originalCount: z.number().int().nonnegative(),
  syntheticCount: z.number().int().nonnegative(),
  trainCount: z.number().int().nonnegative(),
  valCount: z.number().int().nonnegative(),
})

export const classifierSummaryResponseSchema = z.object({
  split: z.object({
    classCount: z.number().int().nonnegative(),
    trainCount: z.number().int().nonnegative(),
    valCount: z.number().int().nonnegative(),
    perClass: z.array(classifierSplitClassSchema),
    error: z.string().nullable().optional(),
  }),
  models: z.array(
    z.object({
      id: z.string(),
      taskId: z.string(),
      datasetVersionId: z.string(),
      status: z.string(),
      modelKey: z.string().nullable().optional(),
      classNames: z.array(z.string()).default([]),
      hparams: z.record(z.number()).default({}),
      pretrainedWeightsPath: z.string().nullable().optional(),
      metrics: metricsResponseSchema.nullable().optional(),
      createdAt: z.string().nullable().optional(),
      finishedAt: z.string().nullable().optional(),
    }),
  ),
})

export const downloadResponseSchema = z.object({
  downloadPath: z.string(),
})

export const workflowSocketEventSchema = z.object({
  type: z.enum([
    'session.updated',
    'fine_tune.progress',
    'generation.progress',
    'modification.progress',
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
export type DatasetsCatalogResponse = z.infer<typeof datasetsCatalogResponseSchema>
export type GenerationConfigResponse = z.infer<typeof generationConfigResponseSchema>
export type GenerationResultsResponse = z.infer<typeof generationResultsResponseSchema>
export type JobsResponse = z.infer<typeof jobsResponseSchema>
export type MetricsResponse = z.infer<typeof metricsResponseSchema>
export type TaskStatusResponse = z.infer<typeof taskStatusResponseSchema>
export type UploadInitResponse = z.infer<typeof uploadInitResponseSchema>
export type UploadStatusResponse = z.infer<typeof uploadStatusResponseSchema>
export type WorkflowSocketEvent = z.infer<typeof workflowSocketEventSchema>
