import {
  DatasetStatsResponse,
  GenerationConfigResponse,
  GenerationResultsResponse,
  MetricsResponse,
  SessionSnapshotResponse,
} from '@/shared/api/contracts'
import { endpoints } from '@/shared/api/endpoints'
import { env } from '@/shared/config/env'
import { DatasetClassStat, GenerationAsset, WorkflowMetrics, WorkflowStage } from '@/shared/types/workflow'

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
