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
  ClassifierSplitSummary,
  DatasetCatalogItem,
  DatasetClassStat,
  GenerationAsset,
  GlobalJob,
  ModificationSourceAsset,
  TrainedClassifierModel,
  WorkflowMetrics,
  WorkflowStage,
} from '@/shared/types/workflow'

const normalizeWorkflowStage = (stage: SessionSnapshotResponse['workflowStage']): WorkflowStage =>
  stage === 'download' ? 'metrics' : stage === 'mode-select' || stage === 'generate' ? 'modify' : stage

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
  selectedClassTargets: session.selectedClassTargets ?? {},
  currentMode: session.currentMode ?? null,
  fineTuneEnabled: session.fineTuneEnabled,
  fineTuneResolved: session.fineTuneResolved,
  fineTuneJobId: session.fineTuneJobId ?? null,
  generationJobId: session.generationJobId ?? null,
  classifierJobId: session.classifierJobId ?? null,
  downloadUrl: session.downloadPath ? adaptDownload(session.downloadPath) : null,
  workflowStage: normalizeWorkflowStage(session.workflowStage),
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
    referenceUrls: item.referencePreviewPaths.map((path) => toFileUrl(path)),
  })),
})

export const adaptModificationSource = (assetId: string, previewPath: string, className: string) => ({
  assetId,
  assetUrl: toFileUrl(previewPath),
  className,
})

export const adaptModificationSourceItems = (
  items: Array<{ assetId: string; previewPath: string; className: string }>,
): ModificationSourceAsset[] =>
  items.map((item) => ({
    assetId: item.assetId,
    assetUrl: toFileUrl(item.previewPath),
    className: item.className,
  }))

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

export const adaptClassifierSummary = (response: {
  split: {
    classCount: number
    trainCount: number
    valCount: number
    perClass: Array<{
      className: string
      originalCount: number
      syntheticCount: number
      trainCount: number
      valCount: number
    }>
    error?: string | null
  }
  models: Array<{
    id: string
    taskId: string
    datasetVersionId: string
    status: string
    modelKey?: string | null
    classNames: string[]
    hparams: Record<string, number>
    pretrainedWeightsPath?: string | null
    metrics?: MetricsResponse | null
    createdAt?: string | null
    finishedAt?: string | null
  }>
}): { split: ClassifierSplitSummary; models: TrainedClassifierModel[] } => ({
  split: {
    classCount: response.split.classCount,
    trainCount: response.split.trainCount,
    valCount: response.split.valCount,
    perClass: response.split.perClass,
    error: response.split.error ?? null,
  },
  models: response.models.map((model) => ({
    id: model.id,
    taskId: model.taskId,
    datasetVersionId: model.datasetVersionId,
    status: model.status,
    modelKey: model.modelKey ?? null,
    classNames: model.classNames,
    hparams: model.hparams,
    pretrainedWeightsPath: model.pretrainedWeightsPath ?? null,
    metrics: model.metrics ? adaptMetrics(model.metrics) : null,
    createdAt: model.createdAt ?? null,
    finishedAt: model.finishedAt ?? null,
  })),
})

export const adaptDownload = (downloadPath: string) => toFileUrl(downloadPath)

export const adaptDatasetCatalog = (response: DatasetsCatalogResponse): DatasetCatalogItem[] =>
  response.items.map((item) => ({
    datasetId: item.datasetId,
    datasetName: item.datasetName,
    status: item.status,
    sessionId: item.sessionId,
    workflowStage: normalizeWorkflowStage(item.workflowStage),
    currentMode: item.currentMode ?? null,
    fineTuneEnabled: item.fineTuneEnabled,
    fineTuneResolved: item.fineTuneResolved,
    versionIndex: item.versionIndex,
    assetCount: item.assetCount,
    updatedAt: item.updatedAt,
    previewUrls: item.previewPaths.map((path) => toFileUrl(path)),
    isPendingLocal: false,
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
