import { z } from 'zod'

const templateIdResponseSchema = z.object({
  id: z.string(),
})

export const textPromptTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  prompt: z.string(),
  negativePrompt: z.string().nullable().optional(),
})

export const selectionPromptTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  text: z.string(),
})

export const polygonTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  points: z.array(z.tuple([z.number(), z.number()])),
})

export const datasetTemplatesResponseSchema = z.object({
  textTemplates: z.array(textPromptTemplateSchema),
  selectionTemplates: z.array(selectionPromptTemplateSchema),
  polygonTemplates: z.array(polygonTemplateSchema),
})

export const createTextTemplatePayloadSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  negativePrompt: z.string().optional(),
})

export const createSelectionTemplatePayloadSchema = z.object({
  name: z.string().min(1),
  text: z.string().min(1),
})

export const createPolygonTemplatePayloadSchema = z.object({
  name: z.string().min(1),
  points: z.array(z.tuple([z.number(), z.number()])).min(1),
})

export const updateTemplateNamePayloadSchema = z.object({
  name: z.string().min(1),
})

export const templateIdCreatedResponseSchema = templateIdResponseSchema
