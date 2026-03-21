import { useMutation, useQuery } from '@tanstack/react-query'
import { workflowApi } from '@/shared/api/workflow.api'

type UploadDatasetPayload = {
  file: File
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

const workflowKeys = {
  datasetsCatalog: ['workflow', 'datasets-catalog'] as const,
  jobs: ['workflow', 'jobs'] as const,
  session: (sessionId: string) => ['workflow', 'session', sessionId] as const,
  datasetStats: (sessionId: string) => ['workflow', 'dataset-stats', sessionId] as const,
  generationConfig: (sessionId: string) => ['workflow', 'generation-config', sessionId] as const,
  generationResults: (sessionId: string) => ['workflow', 'generation-results', sessionId] as const,
  metrics: (sessionId: string) => ['workflow', 'metrics', sessionId] as const,
}

export function useDatasetsCatalogQuery() {
  return useQuery({
    queryKey: workflowKeys.datasetsCatalog,
    queryFn: () => workflowApi.getDatasetsCatalog(),
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
  })
}

export function useJobsQuery() {
  return useQuery({
    queryKey: workflowKeys.jobs,
    queryFn: () => workflowApi.getJobs(),
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
  })
}

export function useTaskStatusQuery(sessionId: string | null, taskId: string | null) {
  return useQuery({
    queryKey:
      sessionId && taskId
        ? ['workflow', 'task-status', sessionId, taskId]
        : ['workflow', 'task-status', 'empty'],
    queryFn: () => workflowApi.getTaskStatus(sessionId!, taskId!),
    enabled: Boolean(sessionId && taskId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status) {
        return 2000
      }
      return status === 'pending' || status === 'running' ? 2000 : false
    },
    refetchOnWindowFocus: false,
  })
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

export function useModificationSourceQuery(sessionId: string | null) {
  return useQuery({
    queryKey: sessionId ? ['workflow', 'modification-source', sessionId] : ['workflow', 'modification-source', 'empty'],
    queryFn: () => workflowApi.getModificationSource(sessionId!),
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

export function useDownloadMutation(sessionId: string) {
  return useMutation({
    mutationFn: () => workflowApi.getDownload(sessionId),
  })
}

export function useUploadDatasetMutation() {
  return useMutation({
    mutationFn: ({ file, onProgress, signal }: UploadDatasetPayload) =>
      workflowApi.uploadDataset(file, onProgress, signal),
  })
}

export function useActivateDatasetMutation() {
  return useMutation({
    mutationFn: (datasetId: string) => workflowApi.activateDataset(datasetId),
  })
}

export function useRenameDatasetMutation() {
  return useMutation({
    mutationFn: ({ datasetId, name }: { datasetId: string; name: string }) =>
      workflowApi.renameDataset(datasetId, name),
  })
}

export function useDeleteDatasetMutation() {
  return useMutation({
    mutationFn: (datasetId: string) => workflowApi.deleteDataset(datasetId),
  })
}

export function useCancelJobMutation() {
  return useMutation({
    mutationFn: (jobId: string) => workflowApi.cancelJob(jobId),
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

export function useSyncWorkflowStateMutation(sessionId: string) {
  return useMutation({
    mutationFn: (payload: unknown) => workflowApi.syncWorkflowState(sessionId, payload),
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
