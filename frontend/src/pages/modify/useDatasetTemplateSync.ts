import { useMemo } from 'react'

import {
  useCreateNegativeTemplateMutation,
  useCreatePolygonTemplateMutation,
  useCreateSelectionTemplateMutation,
  useCreateTextTemplateMutation,
  useDatasetTemplatesQuery,
  useDeleteTemplateMutation,
} from '@/shared/api/template.hooks'
import {
  type DatasetModificationTemplates,
  type PolygonTemplate,
} from '@/pages/modify/modify.types'
import { useSessionStore } from '@/store/session/session.store'

const EMPTY_DATASET_TEMPLATES: DatasetModificationTemplates = {
  textTemplates: [],
  negativeTemplates: [],
  selectionTemplates: [],
  polygonTemplates: [],
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function useDatasetTemplateSync(sessionId: string | null) {
  const datasetId = useSessionStore((state) => state.datasetId)
  const modificationTemplatesByDataset = useSessionStore((state) => state.modificationTemplatesByDataset)
  const setSession = useSessionStore((state) => state.setSession)
  const templatesQuery = useDatasetTemplatesQuery(sessionId)
  const createTextTemplateMutation = useCreateTextTemplateMutation(sessionId ?? '')
  const createNegativeTemplateMutation = useCreateNegativeTemplateMutation(sessionId ?? '')
  const createSelectionTemplateMutation = useCreateSelectionTemplateMutation(sessionId ?? '')
  const createPolygonTemplateMutation = useCreatePolygonTemplateMutation(sessionId ?? '')
  const deleteTemplateMutation = useDeleteTemplateMutation(sessionId ?? '')

  const localTemplates = datasetId ? modificationTemplatesByDataset[datasetId] ?? EMPTY_DATASET_TEMPLATES : EMPTY_DATASET_TEMPLATES
  const serverTemplates = templatesQuery.data ?? EMPTY_DATASET_TEMPLATES

  const datasetTemplates = useMemo<DatasetModificationTemplates>(
    () => ({
      textTemplates: [...serverTemplates.textTemplates, ...localTemplates.textTemplates],
      negativeTemplates: [...serverTemplates.negativeTemplates, ...localTemplates.negativeTemplates],
      selectionTemplates: [...serverTemplates.selectionTemplates, ...localTemplates.selectionTemplates],
      polygonTemplates: [...serverTemplates.polygonTemplates, ...localTemplates.polygonTemplates],
    }),
    [localTemplates, serverTemplates],
  )

  const canMigrateLocalTemplates =
    Boolean(datasetId) &&
    (localTemplates.textTemplates.length > 0 ||
      localTemplates.negativeTemplates.length > 0 ||
      localTemplates.selectionTemplates.length > 0 ||
      localTemplates.polygonTemplates.length > 0)

  const updateLocalTemplates = (nextTemplates: DatasetModificationTemplates) => {
    if (!datasetId) {
      return
    }
    setSession({
      modificationTemplatesByDataset: {
        ...modificationTemplatesByDataset,
        [datasetId]: nextTemplates,
      },
    })
  }

  const createTextTemplate = async (name: string, prompt: string) => {
    if (!sessionId) {
      updateLocalTemplates({
        ...localTemplates,
        textTemplates: [
          ...localTemplates.textTemplates,
          { id: `text:${Date.now()}`, name, prompt },
        ],
      })
      return
    }
    await createTextTemplateMutation.mutateAsync({ name, prompt })
  }

  const createNegativeTemplate = async (name: string, text: string) => {
    if (!sessionId) {
      updateLocalTemplates({
        ...localTemplates,
        negativeTemplates: [...localTemplates.negativeTemplates, { id: `negative:${Date.now()}`, name, text }],
      })
      return
    }
    await createNegativeTemplateMutation.mutateAsync({ name, text })
  }

  const createSelectionTemplate = async (name: string, text: string) => {
    if (!sessionId) {
      updateLocalTemplates({
        ...localTemplates,
        selectionTemplates: [...localTemplates.selectionTemplates, { id: `selection:${Date.now()}`, name, text }],
      })
      return
    }
    await createSelectionTemplateMutation.mutateAsync({ name, text })
  }

  const createPolygonTemplate = async (name: string, points: PolygonTemplate['points']) => {
    if (!sessionId) {
      updateLocalTemplates({
        ...localTemplates,
        polygonTemplates: [...localTemplates.polygonTemplates, { id: `polygon:${Date.now()}`, name, points }],
      })
      return
    }
    await createPolygonTemplateMutation.mutateAsync({ name, points })
  }

  const deleteTextTemplate = async (templateId: string) => {
    if (!_isServerTemplate(templateId) || !sessionId) {
      updateLocalTemplates({
        ...localTemplates,
        textTemplates: localTemplates.textTemplates.filter((template) => template.id !== templateId),
      })
      return
    }
    await deleteTemplateMutation.mutateAsync(templateId)
  }

  const deleteSelectionTemplate = async (templateId: string) => {
    if (!_isServerTemplate(templateId) || !sessionId) {
      updateLocalTemplates({
        ...localTemplates,
        selectionTemplates: localTemplates.selectionTemplates.filter((template) => template.id !== templateId),
      })
      return
    }
    await deleteTemplateMutation.mutateAsync(templateId)
  }

  const deletePolygonTemplate = async (templateId: string) => {
    if (!_isServerTemplate(templateId) || !sessionId) {
      updateLocalTemplates({
        ...localTemplates,
        polygonTemplates: localTemplates.polygonTemplates.filter((template) => template.id !== templateId),
      })
      return
    }
    await deleteTemplateMutation.mutateAsync(templateId)
  }

  const migrateLocalTemplates = async () => {
    if (!sessionId || !datasetId || !canMigrateLocalTemplates) {
      return
    }
    for (const template of localTemplates.textTemplates) {
      await createTextTemplateMutation.mutateAsync({
        name: template.name,
        prompt: template.prompt,
      })
    }
    for (const template of localTemplates.negativeTemplates) {
      await createNegativeTemplateMutation.mutateAsync({
        name: template.name,
        text: template.text,
      })
    }
    for (const template of localTemplates.selectionTemplates) {
      await createSelectionTemplateMutation.mutateAsync({
        name: template.name,
        text: template.text,
      })
    }
    for (const template of localTemplates.polygonTemplates) {
      await createPolygonTemplateMutation.mutateAsync({
        name: template.name,
        points: template.points,
      })
    }
    setSession({
      modificationTemplatesByDataset: {
        ...modificationTemplatesByDataset,
        [datasetId]: EMPTY_DATASET_TEMPLATES,
      },
    })
  }

  return {
    canMigrateLocalTemplates,
    createNegativeTemplate,
    createPolygonTemplate,
    createSelectionTemplate,
    createTextTemplate,
    datasetTemplates,
    deletePolygonTemplate,
    deleteSelectionTemplate,
    deleteTextTemplate,
    isMutatingTemplates:
      createTextTemplateMutation.isPending ||
      createNegativeTemplateMutation.isPending ||
      createSelectionTemplateMutation.isPending ||
      createPolygonTemplateMutation.isPending ||
      deleteTemplateMutation.isPending,
    isLoadingTemplates: templatesQuery.isLoading,
    migrateLocalTemplates,
  }
}

function _isServerTemplate(templateId: string) {
  return UUID_PATTERN.test(templateId)
}
