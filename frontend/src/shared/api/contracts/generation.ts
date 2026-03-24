import { z } from 'zod'
import { generationAssetSchema, generationFieldSchema } from '@/shared/api/contracts/common'

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

export type GenerationConfigResponse = z.infer<typeof generationConfigResponseSchema>
export type GenerationResultsResponse = z.infer<typeof generationResultsResponseSchema>
