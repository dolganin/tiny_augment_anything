export const endpoints = {
  datasetsCatalog: '/datasets',
  activateDataset: (datasetId: string) => `/datasets/${datasetId}/activate`,
  updateDataset: (datasetId: string) => `/datasets/${datasetId}`,
  deleteDataset: (datasetId: string) => `/datasets/${datasetId}`,
  datasetDownload: (datasetId: string) => `/datasets/${datasetId}/download`,
  jobs: '/jobs',
  cancelJob: (jobId: string) => `/jobs/${jobId}/cancel`,
  initUpload: '/uploads/init',
  uploadStatus: (uploadId: string) => `/uploads/${uploadId}`,
  uploadChunk: (uploadId: string, partNumber: number, totalParts: number) =>
    `/uploads/${uploadId}/parts?partNumber=${partNumber}&totalParts=${totalParts}`,
  completeUpload: (uploadId: string) => `/uploads/${uploadId}/complete`,
  cancelUpload: (uploadId: string) => `/uploads/${uploadId}`,
  uploadDataset: '/sessions/upload',
  restoreSession: (sessionId: string) => `/sessions/${sessionId}`,
  initClassifierWeightsUpload: (sessionId: string) => `/sessions/${sessionId}/classifier/weights/init`,
  classifierWeightsUploadStatus: (sessionId: string, uploadId: string) =>
    `/sessions/${sessionId}/classifier/weights/${uploadId}`,
  uploadClassifierWeightsChunk: (sessionId: string, uploadId: string, partNumber: number, totalParts: number) =>
    `/sessions/${sessionId}/classifier/weights/${uploadId}/parts?partNumber=${partNumber}&totalParts=${totalParts}`,
  completeClassifierWeightsUpload: (sessionId: string, uploadId: string) =>
    `/sessions/${sessionId}/classifier/weights/${uploadId}/complete`,
  cancelClassifierWeightsUpload: (sessionId: string, uploadId: string) =>
    `/sessions/${sessionId}/classifier/weights/${uploadId}`,
  diffusionLoraAdapters: (sessionId: string) => `/sessions/${sessionId}/diffusion/lora`,
  saveDiffusionLoraName: (sessionId: string) => `/sessions/${sessionId}/diffusion/lora`,
  initDiffusionLoraUpload: (sessionId: string) => `/sessions/${sessionId}/diffusion/lora/init`,
  diffusionLoraUploadStatus: (sessionId: string, uploadId: string) =>
    `/sessions/${sessionId}/diffusion/lora/${uploadId}`,
  uploadDiffusionLoraChunk: (sessionId: string, uploadId: string, partNumber: number, totalParts: number) =>
    `/sessions/${sessionId}/diffusion/lora/${uploadId}/parts?partNumber=${partNumber}&totalParts=${totalParts}`,
  completeDiffusionLoraUpload: (sessionId: string, uploadId: string) =>
    `/sessions/${sessionId}/diffusion/lora/${uploadId}/complete`,
  cancelDiffusionLoraUpload: (sessionId: string, uploadId: string) =>
    `/sessions/${sessionId}/diffusion/lora/${uploadId}`,
  taskStatus: (sessionId: string, taskId: string) => `/sessions/${sessionId}/tasks/${taskId}`,
  cancelTask: (sessionId: string, taskId: string) => `/sessions/${sessionId}/tasks/${taskId}/cancel`,
  datasetStats: (sessionId: string) => `/sessions/${sessionId}/dataset/stats`,
  selectClasses: (sessionId: string) => `/sessions/${sessionId}/dataset/classes`,
  syncWorkflowState: (sessionId: string) => `/sessions/${sessionId}/workflow/state`,
  generationDefaults: (sessionId: string) => `/sessions/${sessionId}/generation/config`,
  startGeneration: (sessionId: string) => `/sessions/${sessionId}/generation`,
  getModificationSource: (sessionId: string) => `/sessions/${sessionId}/modification/source`,
  startModification: (sessionId: string) => `/sessions/${sessionId}/modification`,
  startBatchModification: (sessionId: string) => `/sessions/${sessionId}/modification/batch`,
  batchModificationSources: (sessionId: string, runId: string) => `/sessions/${sessionId}/augmentation-runs/${runId}/sources`,
  generationResults: (sessionId: string) => `/sessions/${sessionId}/results`,
  approveAsset: (sessionId: string, assetId: string) => `/sessions/${sessionId}/results/${assetId}/approve`,
  rejectAsset: (sessionId: string, assetId: string) => `/sessions/${sessionId}/results/${assetId}/reject`,
  finalizeReview: (sessionId: string) => `/sessions/${sessionId}/review/finalize`,
  startClassifierTraining: (sessionId: string) => `/sessions/${sessionId}/classifier/train`,
  classifierSummary: (sessionId: string) => `/sessions/${sessionId}/classifier/summary`,
  getMetrics: (sessionId: string) => `/sessions/${sessionId}/metrics`,
  fileByPath: '/assets',
  workflowSocket: (sessionId: string) => `/sessions/${sessionId}/stream`,
}
