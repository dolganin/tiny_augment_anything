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

export const taskStartedResponseSchema = z.object({
  jobId: z.string(),
  status: apiTaskStatusSchema,
})

export const statusResponseSchema = z.object({
  status: z.literal('success'),
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

export const diffusionLoraAdapterSchema = z.object({
  fileName: z.string(),
  adapterPath: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  updatedAt: z.string(),
})

export const diffusionLoraAdaptersResponseSchema = z.object({
  items: z.array(diffusionLoraAdapterSchema),
})

export const diffusionLoraUploadResponseSchema = z.object({
  fileName: z.string(),
  adapterPath: z.string(),
})

export const taskStatusResponseSchema = z.object({
  jobId: z.string(),
  status: apiTaskStatusSchema,
  progress: z.number().min(0).max(1).nullable(),
  message: z.string().nullable(),
  error: z.object({ message: z.string().optional() }).nullable().optional(),
  taskType: z.string(),
})

export const workflowSocketEventSchema = z.object({
  type: z.enum([
    'session.updated',
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

export type TaskStatusResponse = z.infer<typeof taskStatusResponseSchema>
export type UploadInitResponse = z.infer<typeof uploadInitResponseSchema>
export type UploadStatusResponse = z.infer<typeof uploadStatusResponseSchema>
export type WorkflowSocketEvent = z.infer<typeof workflowSocketEventSchema>
export type DiffusionLoraAdapter = z.infer<typeof diffusionLoraAdapterSchema>
