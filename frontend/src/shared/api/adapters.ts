import {
  DatasetsCatalogResponse,
  DatasetStatsResponse,
  GenerationConfigResponse,
  GenerationResultsResponse,
  JobsResponse,
  MetricsResponse,
  SessionSnapshotResponse,
} from '@/shared/api/contracts'
import { endpoints } from '@/shared/api/endpoints'
import { env } from '@/shared/config/env'
import {
  DatasetCatalogItem,
  DatasetClassStat,
  GenerationAsset,
  GlobalJob,
  WorkflowMetrics,
  WorkflowStage,
} from '@/shared/types/workflow'

const toFileUrl = (path: string) => {
  const fileUrl = new URL(`${env.apiBaseUrl}${endpoints.fileByPath}`)
  fileUrl.searchParams.set('path', path)
  return fileUrl.toString()
}

export const adaptSessionSnapshot = (session: SessionSnapshotResponse) => ({
  sessionId: session.sessionId,
  datasetId: session.datasetId ?? null,
  datasetName: session.datasetName ?? null,
  selectedClasses: session.selectedClasses,
  currentMode: session.currentMode ?? null,
  fineTuneEnabled: session.fineTuneEnabled,
  fineTuneResolved: session.fineTuneResolved,
  fineTuneJobId: session.fineTuneJobId ?? null,
  generationJobId: session.generationJobId ?? null,
  classifierJobId: session.classifierJobId ?? null,
  downloadUrl: session.downloadPath ? adaptDownload(session.downloadPath) : null,
  workflowStage: session.workflowStage as WorkflowStage,
})

export const adaptDatasetStats = (response: DatasetStatsResponse): DatasetClassStat[] =>
  response.classes.map((item) => ({
    name: item.name,
    count: item.count,
  }))

export const adaptGenerationConfig = (response: GenerationConfigResponse) => ({
  sampleCount: response.sampleCount,
  fields: response.fields,
})

export const adaptGenerationResults = (response: GenerationResultsResponse) => ({
  remainingCount: response.remainingCount,
  targetCount: response.targetCount,
  items: response.items.map<GenerationAsset>((item) => ({
    id: item.id,
    previewUrl: toFileUrl(item.previewPath),
    sourceUrl: item.sourcePath ? toFileUrl(item.sourcePath) : undefined,
    className: item.className,
  })),
})

export const adaptModificationSource = (assetPath: string) => ({
  assetPath,
  assetUrl: toFileUrl(assetPath),
})

export const adaptMetrics = (response: MetricsResponse): WorkflowMetrics => ({
  precision: response.precision.map((item) => ({
    name: item.name,
    value: item.value,
  })),
  recall: response.recall.map((item) => ({
    name: item.name,
    value: item.value,
  })),
})

export const adaptDownload = (downloadPath: string) => toFileUrl(downloadPath)

export const adaptDatasetCatalog = (response: DatasetsCatalogResponse): DatasetCatalogItem[] =>
  response.items.map((item) => ({
    datasetId: item.datasetId,
    datasetName: item.datasetName,
    sessionId: item.sessionId,
    workflowStage: item.workflowStage as WorkflowStage,
    currentMode: item.currentMode ?? null,
    fineTuneEnabled: item.fineTuneEnabled,
    fineTuneResolved: item.fineTuneResolved,
    versionIndex: item.versionIndex,
    assetCount: item.assetCount,
    updatedAt: item.updatedAt,
    recentTasks: item.recentTasks.map((task) => ({
      jobId: task.jobId,
      taskType: task.taskType,
      status: task.status,
      progress: task.progress,
      message: task.message,
      errorMessage: task.errorMessage,
    })),
  }))

export const adaptJobs = (response: JobsResponse): GlobalJob[] =>
  response.items.map((item) => ({
    jobId: item.jobId,
    sessionId: item.sessionId,
    datasetId: item.datasetId,
    datasetName: item.datasetName,
    taskType: item.taskType,
    status: item.status,
    progress: item.progress,
    message: item.message,
    errorMessage: item.errorMessage,
    createdAt: item.createdAt,
    startedAt: item.startedAt,
    finishedAt: item.finishedAt,
    heartbeatAt: item.heartbeatAt,
  }))
