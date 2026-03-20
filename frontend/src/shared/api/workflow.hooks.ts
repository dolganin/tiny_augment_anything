import { useMutation, useQuery } from '@tanstack/react-query'
import { workflowApi } from '@/shared/api/workflow.api'

const workflowKeys = {
  session: (sessionId: string) => ['workflow', 'session', sessionId] as const,
  datasetStats: (sessionId: string) => ['workflow', 'dataset-stats', sessionId] as const,
  generationConfig: (sessionId: string) => ['workflow', 'generation-config', sessionId] as const,
  generationResults: (sessionId: string) => ['workflow', 'generation-results', sessionId] as const,
  metrics: (sessionId: string) => ['workflow', 'metrics', sessionId] as const,
}

export function useRestoreSessionQuery(sessionId: string | null) {
  return useQuery({
    queryKey: sessionId ? workflowKeys.session(sessionId) : ['workflow', 'session', 'empty'],
    queryFn: () => workflowApi.restoreSession(sessionId!),
    enabled: Boolean(sessionId),
  })
}

export function useDatasetStatsQuery(sessionId: string | null) {
  return useQuery({
    queryKey: sessionId ? workflowKeys.datasetStats(sessionId) : ['workflow', 'dataset-stats', 'empty'],
    queryFn: () => workflowApi.getDatasetStats(sessionId!),
    enabled: Boolean(sessionId),
  })
}

export function useGenerationConfigQuery(sessionId: string | null) {
  return useQuery({
    queryKey: sessionId ? workflowKeys.generationConfig(sessionId) : ['workflow', 'generation-config', 'empty'],
    queryFn: () => workflowApi.getGenerationConfig(sessionId!),
    enabled: Boolean(sessionId),
  })
}

export function useGenerationResultsQuery(sessionId: string | null) {
  return useQuery({
    queryKey: sessionId ? workflowKeys.generationResults(sessionId) : ['workflow', 'generation-results', 'empty'],
    queryFn: () => workflowApi.getGenerationResults(sessionId!),
    enabled: Boolean(sessionId),
  })
}

export function useMetricsQuery(sessionId: string | null) {
  return useQuery({
    queryKey: sessionId ? workflowKeys.metrics(sessionId) : ['workflow', 'metrics', 'empty'],
    queryFn: () => workflowApi.getMetrics(sessionId!),
    enabled: Boolean(sessionId),
  })
}

export function useUploadDatasetMutation() {
  return useMutation({
    mutationFn: (file: File) => workflowApi.uploadDataset(file),
  })
}

export function useSelectedClassesMutation(sessionId: string) {
  return useMutation({
    mutationFn: (classNames: string[]) => workflowApi.saveSelectedClasses(sessionId, classNames),
  })
}

export function useStartFineTuneMutation(sessionId: string) {
  return useMutation({
    mutationFn: () => workflowApi.startFineTune(sessionId),
  })
}

export function useStartGenerationMutation(sessionId: string) {
  return useMutation({
    mutationFn: (payload: unknown) => workflowApi.startGeneration(sessionId, payload),
  })
}

export function useStartModificationMutation(sessionId: string) {
  return useMutation({
    mutationFn: (payload: unknown) => workflowApi.startModification(sessionId, payload),
  })
}

export function useApproveAssetMutation(sessionId: string) {
  return useMutation({
    mutationFn: (assetId: string) => workflowApi.approveAsset(sessionId, assetId),
  })
}

export function useRejectAssetMutation(sessionId: string) {
  return useMutation({
    mutationFn: (assetId: string) => workflowApi.rejectAsset(sessionId, assetId),
  })
}

export function useStartClassifierTrainingMutation(sessionId: string) {
  return useMutation({
    mutationFn: () => workflowApi.startClassifierTraining(sessionId),
  })
}
