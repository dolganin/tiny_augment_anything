import { z } from 'zod'
import { metricsPointSchema } from '@/shared/api/contracts/common'

export const classifierWeightsUploadResponseSchema = z.object({
  status: z.literal('success'),
  fileName: z.string(),
  weightsPath: z.string(),
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

export type MetricsResponse = z.infer<typeof metricsResponseSchema>
