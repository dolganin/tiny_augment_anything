import {
  datasetsCatalogResponseSchema,
  datasetStatsResponseSchema,
  datasetUploadResponseSchema,
  downloadResponseSchema,
  generationConfigResponseSchema,
  generationResultsResponseSchema,
  jobsResponseSchema,
  generationStartPayloadSchema,
  metricsResponseSchema,
  modificationSourceResponseSchema,
  modificationStartPayloadSchema,
  selectedClassesPayloadSchema,
  sessionSnapshotResponseSchema,
  statusResponseSchema,
  syncStateResponseSchema,
  taskStartedResponseSchema,
  taskStatusResponseSchema,
  uploadInitResponseSchema,
} from '@/shared/api/contracts'
import { endpoints } from '@/shared/api/endpoints'
import { http } from '@/shared/api/http'

export const workflowApi = {
  async getDatasetsCatalog() {
    const response = await http.get(endpoints.datasetsCatalog)
    return datasetsCatalogResponseSchema.parse(response.data)
  },
  async activateDataset(datasetId: string) {
    const response = await http.post(endpoints.activateDataset(datasetId))
    return sessionSnapshotResponseSchema.parse(response.data)
  },
  async renameDataset(datasetId: string, name: string) {
    const response = await http.patch(endpoints.updateDataset(datasetId), { name })
    return statusResponseSchema.parse(response.data)
  },
  async deleteDataset(datasetId: string) {
    const response = await http.delete(endpoints.deleteDataset(datasetId))
    return statusResponseSchema.parse(response.data)
  },
  async getJobs() {
    const response = await http.get(endpoints.jobs)
    return jobsResponseSchema.parse(response.data)
  },
  async cancelJob(jobId: string) {
    const response = await http.post(endpoints.cancelJob(jobId))
    return taskStartedResponseSchema.parse(response.data)
  },
  async getTaskStatus(sessionId: string, taskId: string) {
    const response = await http.get(endpoints.taskStatus(sessionId, taskId))
    return taskStatusResponseSchema.parse(response.data)
  },
  async cancelUpload(uploadId: string) {
    const response = await http.delete(endpoints.cancelUpload(uploadId))
    return statusResponseSchema.parse(response.data)
  },
  async uploadDataset(file: File, onProgress?: (progress: number) => void, signal?: AbortSignal) {
    let uploadId: string | null = null
    try {
      const initResponse = await http.post(
        endpoints.initUpload,
        { fileName: file.name, fileSize: file.size },
        { timeout: 30_000, signal },
      )
      const upload = uploadInitResponseSchema.parse(initResponse.data)
      uploadId = upload.uploadId
      const totalParts = upload.totalParts

      for (let partNumber = 0; partNumber < totalParts; partNumber += 1) {
        const start = partNumber * upload.chunkSize
        const end = Math.min(file.size, start + upload.chunkSize)
        const chunk = file.slice(start, end)
        const uploadedBefore = start
        await http.put(endpoints.uploadChunk(upload.uploadId, partNumber, totalParts), chunk, {
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          timeout: 0,
          signal,
          onUploadProgress: (event) => {
            const loaded = event.loaded ?? chunk.size
            const progress = Math.min(100, Math.round(((uploadedBefore + loaded) / file.size) * 100))
            onProgress?.(progress)
          },
        })
        onProgress?.(Math.min(100, Math.round((end / file.size) * 100)))
      }

      const response = await http.post(endpoints.completeUpload(upload.uploadId), null, {
        timeout: 0,
        signal,
      })
      return datasetUploadResponseSchema.parse(response.data)
    } catch (error) {
      if (uploadId && signal?.aborted) {
        void workflowApi.cancelUpload(uploadId).catch(() => undefined)
      }
      throw error
    }
  },
  async restoreSession(sessionId: string) {
    const response = await http.get(endpoints.restoreSession(sessionId))
    return sessionSnapshotResponseSchema.parse(response.data)
  },
  async getDatasetStats(sessionId: string) {
    const response = await http.get(endpoints.datasetStats(sessionId))
    return datasetStatsResponseSchema.parse(response.data)
  },
  async saveSelectedClasses(sessionId: string, classNames: string[]) {
    const payload = selectedClassesPayloadSchema.parse({ classNames })
    const response = await http.post(endpoints.selectClasses(sessionId), payload)
    return taskStartedResponseSchema.parse(response.data)
  },
  async syncWorkflowState(sessionId: string, payload: unknown) {
    const response = await http.post(endpoints.syncWorkflowState(sessionId), payload)
    return syncStateResponseSchema.parse(response.data)
  },
  async startFineTune(sessionId: string) {
    const response = await http.post(endpoints.startFineTune(sessionId))
    return taskStartedResponseSchema.parse(response.data)
  },
  async getGenerationConfig(sessionId: string) {
    const response = await http.get(endpoints.generationDefaults(sessionId))
    return generationConfigResponseSchema.parse(response.data)
  },
  async startGeneration(sessionId: string, payload: unknown) {
    const parsedPayload = generationStartPayloadSchema.parse(payload)
    const response = await http.post(endpoints.startGeneration(sessionId), parsedPayload)
    return taskStartedResponseSchema.parse(response.data)
  },
  async getModificationSource(sessionId: string) {
    const response = await http.get(endpoints.getModificationSource(sessionId))
    return modificationSourceResponseSchema.parse(response.data)
  },
  async startModification(sessionId: string, payload: unknown) {
    const parsedPayload = modificationStartPayloadSchema.parse(payload)
    const response = await http.post(endpoints.startModification(sessionId), parsedPayload)
    return taskStartedResponseSchema.parse(response.data)
  },
  async getGenerationResults(sessionId: string) {
    const response = await http.get(endpoints.generationResults(sessionId))
    return generationResultsResponseSchema.parse(response.data)
  },
  async approveAsset(sessionId: string, assetId: string) {
    const response = await http.post(endpoints.approveAsset(sessionId, assetId))
    return taskStartedResponseSchema.parse(response.data)
  },
  async rejectAsset(sessionId: string, assetId: string) {
    const response = await http.post(endpoints.rejectAsset(sessionId, assetId))
    return taskStartedResponseSchema.parse(response.data)
  },
  async startClassifierTraining(sessionId: string) {
    const response = await http.post(endpoints.startClassifierTraining(sessionId))
    return taskStartedResponseSchema.parse(response.data)
  },
  async getMetrics(sessionId: string) {
    const response = await http.get(endpoints.getMetrics(sessionId))
    return metricsResponseSchema.parse(response.data)
  },
  async getDownload(sessionId: string) {
    const response = await http.get(endpoints.getDownload(sessionId))
    return downloadResponseSchema.parse(response.data)
  },
}
