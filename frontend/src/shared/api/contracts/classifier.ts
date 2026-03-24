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
  uploadedWeights: z.array(
    z.object({
      displayName: z.string(),
      fileName: z.string(),
      weightsPath: z.string(),
      sizeBytes: z.number().int().nonnegative(),
      updatedAt: z.string(),
    }),
  ),
})

export type MetricsResponse = z.infer<typeof metricsResponseSchema>
