import {
  datasetsCatalogResponseSchema,
  datasetStatsResponseSchema,
  datasetUploadResponseSchema,
  classifierWeightsUploadResponseSchema,
  classifierSummaryResponseSchema,
  diffusionLoraAdaptersResponseSchema,
  diffusionLoraUploadResponseSchema,
  finalizeReviewPayloadSchema,
  finalizeReviewResponseSchema,
  batchModificationStartPayloadSchema,
  batchModificationRunSummarySchema,
  batchModificationSourcesResponseSchema,
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
  uploadStatusResponseSchema,
} from '@/shared/api/contracts'
import { endpoints } from '@/shared/api/endpoints'
import { env } from '@/shared/config/env'
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
  getDatasetDownloadUrl(datasetId: string) {
    return `${env.apiBaseUrl}${endpoints.datasetDownload(datasetId)}`
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
  async cancelTask(sessionId: string, taskId: string) {
    const response = await http.post(endpoints.cancelTask(sessionId, taskId))
    return taskStartedResponseSchema.parse(response.data)
  },
  async initUpload(fileName: string, fileSize: number, signal?: AbortSignal) {
    const response = await http.post(
      endpoints.initUpload,
      { fileName, fileSize },
      { timeout: 30_000, signal },
    )
    return uploadInitResponseSchema.parse(response.data)
  },
  async getUploadStatus(uploadId: string) {
    const response = await http.get(endpoints.uploadStatus(uploadId))
    return uploadStatusResponseSchema.parse(response.data)
  },
  async uploadChunk(
    uploadId: string,
    partNumber: number,
    totalParts: number,
    chunk: Blob,
    signal?: AbortSignal,
    onProgress?: (progress: number) => void,
  ) {
    const response = await http.put(endpoints.uploadChunk(uploadId, partNumber, totalParts), chunk, {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      timeout: 0,
      signal,
      onUploadProgress: (event) => {
        const loaded = event.loaded ?? chunk.size
        const progress = chunk.size === 0 ? 1 : loaded / chunk.size
        onProgress?.(Math.min(1, progress))
      },
    })
    return statusResponseSchema.parse(response.data)
  },
  async completeUpload(uploadId: string, signal?: AbortSignal) {
    const response = await http.post(endpoints.completeUpload(uploadId), null, {
      timeout: 0,
      signal,
    })
    return datasetUploadResponseSchema.parse(response.data)
  },
  async cancelUpload(uploadId: string) {
    const response = await http.delete(endpoints.cancelUpload(uploadId))
    return statusResponseSchema.parse(response.data)
  },
  async restoreSession(sessionId: string) {
    const response = await http.get(endpoints.restoreSession(sessionId))
    return sessionSnapshotResponseSchema.parse(response.data)
  },
  async getDatasetStats(sessionId: string) {
    const response = await http.get(endpoints.datasetStats(sessionId))
    return datasetStatsResponseSchema.parse(response.data)
  },
  async saveSelectedClasses(sessionId: string, classNames: string[], classTargets: Record<string, number>) {
    const payload = selectedClassesPayloadSchema.parse({ classNames, classTargets })
    const response = await http.post(endpoints.selectClasses(sessionId), payload)
    return taskStartedResponseSchema.parse(response.data)
  },
  async syncWorkflowState(sessionId: string, payload: unknown) {
    const response = await http.post(endpoints.syncWorkflowState(sessionId), payload)
    return syncStateResponseSchema.parse(response.data)
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
  async startBatchModification(sessionId: string, payload: unknown) {
    const parsedPayload = batchModificationStartPayloadSchema.parse(payload)
    const response = await http.post(endpoints.startBatchModification(sessionId), parsedPayload)
    return taskStartedResponseSchema.parse(response.data)
  },
  async getLatestAugmentationRun(sessionId: string) {
    const response = await http.get(endpoints.latestAugmentationRun(sessionId))
    return batchModificationRunSummarySchema.parse(response.data)
  },
  async getBatchModificationSources(sessionId: string, runId: string) {
    const response = await http.get(endpoints.batchModificationSources(sessionId, runId))
    return batchModificationSourcesResponseSchema.parse(response.data)
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
  async finalizeReview(sessionId: string, payload: unknown) {
    const parsedPayload = finalizeReviewPayloadSchema.parse(payload)
    const response = await http.post(endpoints.finalizeReview(sessionId), parsedPayload)
    return finalizeReviewResponseSchema.parse(response.data)
  },
  async startClassifierTraining(
    sessionId: string,
    payload: Record<string, unknown>,
    options?: {
      signal?: AbortSignal
    },
  ) {
    const response = await http.post(endpoints.startClassifierTraining(sessionId), payload, {
      timeout: 0,
      signal: options?.signal,
    })
    return taskStartedResponseSchema.parse(response.data)
  },
  async initClassifierWeightsUpload(sessionId: string, fileName: string, fileSize: number, signal?: AbortSignal) {
    const response = await http.post(
      endpoints.initClassifierWeightsUpload(sessionId),
      { fileName, fileSize },
      { timeout: 30_000, signal },
    )
    return uploadInitResponseSchema.parse(response.data)
  },
  async getClassifierWeightsUploadStatus(sessionId: string, uploadId: string) {
    const response = await http.get(endpoints.classifierWeightsUploadStatus(sessionId, uploadId))
    return uploadStatusResponseSchema.parse(response.data)
  },
  async uploadClassifierWeightsChunk(
    sessionId: string,
    uploadId: string,
    partNumber: number,
    totalParts: number,
    chunk: Blob,
    signal?: AbortSignal,
    onProgress?: (progress: number) => void,
  ) {
    const response = await http.put(
      endpoints.uploadClassifierWeightsChunk(sessionId, uploadId, partNumber, totalParts),
      chunk,
      {
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        timeout: 0,
        signal,
        onUploadProgress: (event) => {
          const loaded = event.loaded ?? chunk.size
          const progress = chunk.size === 0 ? 1 : loaded / chunk.size
          onProgress?.(Math.min(1, progress))
        },
      },
    )
    return statusResponseSchema.parse(response.data)
  },
  async completeClassifierWeightsUpload(sessionId: string, uploadId: string, signal?: AbortSignal) {
    const response = await http.post(endpoints.completeClassifierWeightsUpload(sessionId, uploadId), null, {
      timeout: 0,
      signal,
    })
    return classifierWeightsUploadResponseSchema.parse(response.data)
  },
  async cancelClassifierWeightsUpload(sessionId: string, uploadId: string) {
    const response = await http.delete(endpoints.cancelClassifierWeightsUpload(sessionId, uploadId))
    return statusResponseSchema.parse(response.data)
  },
  async getDiffusionLoraAdapters(sessionId: string) {
    const response = await http.get(endpoints.diffusionLoraAdapters(sessionId))
    return diffusionLoraAdaptersResponseSchema.parse(response.data)
  },
  async saveDiffusionLoraName(sessionId: string, adapterPath: string, displayName: string) {
    const response = await http.patch(endpoints.saveDiffusionLoraName(sessionId), { adapterPath, displayName })
    return statusResponseSchema.parse(response.data)
  },
  async initDiffusionLoraUpload(sessionId: string, fileName: string, fileSize: number, signal?: AbortSignal) {
    const response = await http.post(
      endpoints.initDiffusionLoraUpload(sessionId),
      { fileName, fileSize },
      { timeout: 30_000, signal },
    )
    return uploadInitResponseSchema.parse(response.data)
  },
  async getDiffusionLoraUploadStatus(sessionId: string, uploadId: string) {
    const response = await http.get(endpoints.diffusionLoraUploadStatus(sessionId, uploadId))
    return uploadStatusResponseSchema.parse(response.data)
  },
  async uploadDiffusionLoraChunk(
    sessionId: string,
    uploadId: string,
    partNumber: number,
    totalParts: number,
    chunk: Blob,
    signal?: AbortSignal,
    onProgress?: (progress: number) => void,
  ) {
    const response = await http.put(
      endpoints.uploadDiffusionLoraChunk(sessionId, uploadId, partNumber, totalParts),
      chunk,
      {
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        timeout: 0,
        signal,
        onUploadProgress: (event) => {
          const loaded = event.loaded ?? chunk.size
          const progress = chunk.size === 0 ? 1 : loaded / chunk.size
          onProgress?.(Math.min(1, progress))
        },
      },
    )
    return statusResponseSchema.parse(response.data)
  },
  async completeDiffusionLoraUpload(sessionId: string, uploadId: string, signal?: AbortSignal) {
    const response = await http.post(endpoints.completeDiffusionLoraUpload(sessionId, uploadId), null, {
      timeout: 0,
      signal,
    })
    return diffusionLoraUploadResponseSchema.parse(response.data)
  },
  async cancelDiffusionLoraUpload(sessionId: string, uploadId: string) {
    const response = await http.delete(endpoints.cancelDiffusionLoraUpload(sessionId, uploadId))
    return statusResponseSchema.parse(response.data)
  },
  async getClassifierSummary(sessionId: string) {
    const response = await http.get(endpoints.classifierSummary(sessionId))
    return classifierSummaryResponseSchema.parse(response.data)
  },
  async getMetrics(sessionId: string) {
    const response = await http.get(endpoints.getMetrics(sessionId))
    return metricsResponseSchema.parse(response.data)
  },
}
