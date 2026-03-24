import { z } from 'zod'
import {
  apiErrorSchema,
  apiTaskStatusSchema,
  datasetClassStatSchema,
  taskStartedResponseSchema,
} from '@/shared/api/contracts/common'

export const datasetUploadResponseSchema = z.object({
  sessionId: z.string(),
  datasetId: z.string(),
  datasetName: z.string().nullable().optional(),
  jobId: z.string(),
  status: apiTaskStatusSchema,
  error: apiErrorSchema.nullable().optional(),
})

export const sessionSnapshotResponseSchema = z.object({
  sessionId: z.string(),
  datasetId: z.string().nullable().optional(),
  datasetName: z.string().nullable().optional(),
  selectedClasses: z.array(z.string()).default([]),
  selectedClassTargets: z.record(z.number().int().positive()).default({}),
  currentMode: z.enum(['generate', 'modify']).nullable().optional(),
  generationJobId: z.string().nullable().optional(),
  classifierJobId: z.string().nullable().optional(),
  downloadPath: z.string().nullable().optional(),
  workflowStage: z
    .enum([
      'upload',
      'dataset-stats',
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

export const syncStateResponseSchema = z.object({
  status: z.literal('success'),
})

export const downloadResponseSchema = z.object({
  downloadPath: z.string(),
})

export type DatasetUploadResponse = z.infer<typeof datasetUploadResponseSchema>
export type SessionSnapshotResponse = z.infer<typeof sessionSnapshotResponseSchema>
export type DatasetStatsResponse = z.infer<typeof datasetStatsResponseSchema>
export type DatasetsCatalogResponse = z.infer<typeof datasetsCatalogResponseSchema>
export type JobsResponse = z.infer<typeof jobsResponseSchema>

export { taskStartedResponseSchema }
