import {
  createNegativeTemplatePayloadSchema,
  createPolygonTemplatePayloadSchema,
  createSelectionTemplatePayloadSchema,
  createTextTemplatePayloadSchema,
  datasetTemplatesResponseSchema,
  statusResponseSchema,
  templateIdCreatedResponseSchema,
  updateTemplateNamePayloadSchema,
} from '@/shared/api/contracts'
import { http } from '@/shared/api/http'

const templateEndpoints = {
  datasetTemplates: (sessionId: string) => `/sessions/${sessionId}/templates`,
  createTextTemplate: (sessionId: string) => `/sessions/${sessionId}/templates/text`,
  createNegativeTemplate: (sessionId: string) => `/sessions/${sessionId}/templates/negative`,
  createSelectionTemplate: (sessionId: string) => `/sessions/${sessionId}/templates/selection`,
  createPolygonTemplate: (sessionId: string) => `/sessions/${sessionId}/templates/polygon`,
  updateTemplate: (sessionId: string, templateId: string) => `/sessions/${sessionId}/templates/${templateId}`,
  deleteTemplate: (sessionId: string, templateId: string) => `/sessions/${sessionId}/templates/${templateId}`,
}

export const templatesApi = {
  async getDatasetTemplates(sessionId: string) {
    const response = await http.get(templateEndpoints.datasetTemplates(sessionId))
    return datasetTemplatesResponseSchema.parse(response.data)
  },
  async createTextTemplate(sessionId: string, payload: unknown) {
    const parsedPayload = createTextTemplatePayloadSchema.parse(payload)
    const response = await http.post(templateEndpoints.createTextTemplate(sessionId), parsedPayload)
    return templateIdCreatedResponseSchema.parse(response.data)
  },
  async createNegativeTemplate(sessionId: string, payload: unknown) {
    const parsedPayload = createNegativeTemplatePayloadSchema.parse(payload)
    const response = await http.post(templateEndpoints.createNegativeTemplate(sessionId), parsedPayload)
    return templateIdCreatedResponseSchema.parse(response.data)
  },
  async createSelectionTemplate(sessionId: string, payload: unknown) {
    const parsedPayload = createSelectionTemplatePayloadSchema.parse(payload)
    const response = await http.post(templateEndpoints.createSelectionTemplate(sessionId), parsedPayload)
    return templateIdCreatedResponseSchema.parse(response.data)
  },
  async createPolygonTemplate(sessionId: string, payload: unknown) {
    const parsedPayload = createPolygonTemplatePayloadSchema.parse(payload)
    const response = await http.post(templateEndpoints.createPolygonTemplate(sessionId), parsedPayload)
    return templateIdCreatedResponseSchema.parse(response.data)
  },
  async updateTemplateName(sessionId: string, templateId: string, payload: unknown) {
    const parsedPayload = updateTemplateNamePayloadSchema.parse(payload)
    const response = await http.patch(templateEndpoints.updateTemplate(sessionId, templateId), parsedPayload)
    return statusResponseSchema.parse(response.data)
  },
  async deleteTemplate(sessionId: string, templateId: string) {
    const response = await http.delete(templateEndpoints.deleteTemplate(sessionId, templateId))
    return statusResponseSchema.parse(response.data)
  },
}
