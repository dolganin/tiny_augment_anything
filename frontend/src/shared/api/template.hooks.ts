import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { templatesApi } from '@/shared/api/templates.api'

const templateKeys = {
  datasetTemplates: (sessionId: string) => ['workflow', 'dataset-templates', sessionId] as const,
}

export function useDatasetTemplatesQuery(sessionId: string | null) {
  return useQuery({
    queryKey: sessionId ? templateKeys.datasetTemplates(sessionId) : ['workflow', 'dataset-templates', 'empty'],
    queryFn: () => templatesApi.getDatasetTemplates(sessionId!),
    enabled: Boolean(sessionId),
    refetchOnWindowFocus: false,
  })
}

export function useCreateTextTemplateMutation(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: unknown) => templatesApi.createTextTemplate(sessionId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: templateKeys.datasetTemplates(sessionId) })
    },
  })
}

export function useCreateNegativeTemplateMutation(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: unknown) => templatesApi.createNegativeTemplate(sessionId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: templateKeys.datasetTemplates(sessionId) })
    },
  })
}

export function useCreateSelectionTemplateMutation(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: unknown) => templatesApi.createSelectionTemplate(sessionId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: templateKeys.datasetTemplates(sessionId) })
    },
  })
}

export function useCreatePolygonTemplateMutation(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: unknown) => templatesApi.createPolygonTemplate(sessionId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: templateKeys.datasetTemplates(sessionId) })
    },
  })
}

export function useRenameTemplateMutation(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ templateId, name }: { templateId: string; name: string }) =>
      templatesApi.updateTemplateName(sessionId, templateId, { name }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: templateKeys.datasetTemplates(sessionId) })
    },
  })
}

export function useDeleteTemplateMutation(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string) => templatesApi.deleteTemplate(sessionId, templateId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: templateKeys.datasetTemplates(sessionId) })
    },
  })
}
