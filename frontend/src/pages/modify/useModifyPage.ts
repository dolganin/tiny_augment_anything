import { useEffect, useMemo, useRef, useState } from 'react'
import { UseFormReturn } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { ModificationMode } from '@/features/modification/ModificationModeToggle'
import { useModificationShortcuts } from '@/features/modification/useModificationShortcuts'
import { adaptGenerationConfig, adaptModificationSource, adaptModificationSourceItems } from '@/shared/api/adapters'
import {
  useFinalizeReviewMutation,
  useGenerationConfigQuery,
  useGenerationResultsQuery,
  useModificationSourceQuery,
  useStartBatchModificationMutation,
  useStartModificationMutation,
  useTaskStatusQuery,
} from '@/shared/api/workflow.hooks'
import { useWorkflowSocket } from '@/shared/api/workflow.socket'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { ModificationSourceAsset } from '@/shared/types/workflow'
import { useSessionStore } from '@/store/session/session.store'
import { useDatasetTemplateSync } from '@/pages/modify/useDatasetTemplateSync'
import {
  type AreaPoint,
  type ModificationLaunchMode,
  type ModifyFormValues,
  type PolygonTemplate,
  type PromptTemplate,
  type SelectionPromptTemplate,
  type TextPromptTemplate,
} from '@/pages/modify/modify.types'

type UseModifyPageParams = {
  form: UseFormReturn<ModifyFormValues>
}

const PRIORITY_FIELD_KEYS = ['size', 'strength', 'inpaint_strength', 'num_inference_steps', 'guidance_scale']
const HIDDEN_SECONDARY_KEYS = ['sam_prompt', 'negative_prompt', 'lora_path', ...PRIORITY_FIELD_KEYS]

const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'text-accessory-mask',
    name: 'Маска на лице',
    scope: 'text',
    text: 'add a clean medical mask to the {className}, keep photorealistic details',
    negativeText: 'blurry, deformed, extra accessories, duplicate face',
  },
  {
    id: 'text-accessory-glasses',
    name: 'Очки',
    scope: 'text',
    text: 'add stylish sunglasses to the {className}, keep natural lighting and anatomy',
    negativeText: 'blurry, warped glasses, duplicate objects',
  },
  {
    id: 'selection-face',
    name: 'Выделение лица',
    scope: 'selection',
    text: 'face area of the {className}',
  },
  {
    id: 'selection-head',
    name: 'Выделение головы',
    scope: 'selection',
    text: 'head and hair area of the {className}',
  },
]

const interpolateTemplateText = (value: string, source: ModificationSourceAsset | null) =>
  value.replaceAll('{className}', source?.className ?? 'object')

export function useModifyPage({ form }: UseModifyPageParams) {
  const navigate = useNavigate()
  const sessionId = useSessionStore((state) => state.sessionId)
  const generationJobId = useSessionStore((state) => state.generationJobId)
  const generationConfig = useSessionStore((state) => state.generationConfig)
  const storedPromptTemplates = useSessionStore((state) => state.promptTemplates)
  const selectedClassTargets = useSessionStore((state) => state.selectedClassTargets)
  const workflowStage = useSessionStore((state) => state.workflowStage)
  const setSession = useSessionStore((state) => state.setSession)

  const [fieldValues, setFieldValues] = useState<Record<string, string>>(generationConfig)
  const [sharedAreaPoints, setSharedAreaPoints] = useState<AreaPoint[]>([])
  const [sharedAreaConfirmed, setSharedAreaConfirmed] = useState(false)
  const [areaPointsBySourceId, setAreaPointsBySourceId] = useState<Record<string, AreaPoint[]>>({})
  const [areaConfirmedBySourceId, setAreaConfirmedBySourceId] = useState<Record<string, boolean>>({})
  const [selectedSourceAssetId, setSelectedSourceAssetId] = useState<string | null>(null)
  const [selectedSourceIds, setSelectedSourceIds] = useState<Record<string, boolean>>({})
  const [logs, setLogs] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isModificationModalOpen, setIsModificationModalOpen] = useState(true)
  const [launchMode, setLaunchMode] = useState<ModificationLaunchMode>('batch')
  const [modificationMode, setModificationMode] = useState<ModificationMode>('inpaint')
  const [applyPromptToAll, setApplyPromptToAll] = useState(true)
  const [applyMaskToAll, setApplyMaskToAll] = useState(true)
  const [promptBySourceId, setPromptBySourceId] = useState<Record<string, string>>({})
  const taskSnapshotRef = useRef<string | null>(null)

  const configQuery = useGenerationConfigQuery(sessionId)
  const reviewResultsQuery = useGenerationResultsQuery(sessionId)
  const sourceQuery = useModificationSourceQuery(sessionId)
  const batchModificationMutation = useStartBatchModificationMutation(sessionId ?? '')
  const singleModificationMutation = useStartModificationMutation(sessionId ?? '')
  const finalizeReviewMutation = useFinalizeReviewMutation(sessionId ?? '')
  const taskStatusQuery = useTaskStatusQuery(sessionId, generationJobId)
  const {
    canMigrateLocalTemplates,
    createPolygonTemplate,
    createSelectionTemplate,
    createTextTemplate,
    datasetTemplates,
    deletePolygonTemplate,
    deleteSelectionTemplate,
    deleteTextTemplate,
    migrateLocalTemplates,
  } = useDatasetTemplateSync(sessionId)

  useEffect(() => {
    if (workflowStage !== 'review') {
      setSession({ workflowStage: 'modify' })
    }
  }, [setSession, workflowStage])

  useEffect(() => {
    if (!configQuery.data) {
      return
    }
    const config = adaptGenerationConfig(configQuery.data)
    const nextFieldValues = Object.fromEntries(config.fields.map((field) => [field.key, field.value]))
    setFieldValues(nextFieldValues)
    setSession({ generationConfig: nextFieldValues })
    form.reset({ prompt: '' })
    setPromptBySourceId({})
  }, [configQuery.data, form, setSession])

  useEffect(() => {
    taskSnapshotRef.current = null
  }, [generationJobId])

  useEffect(() => {
    if (configQuery.error) {
      setErrorMessage(getErrorMessage(configQuery.error))
    }
    if (sourceQuery.error) {
      setErrorMessage(getErrorMessage(sourceQuery.error))
    }
  }, [configQuery.error, sourceQuery.error])

  useWorkflowSocket({
    sessionId,
    onError: () =>
      setLogs((current) =>
        current.includes('WebSocket недоступен, продолжаю через polling статуса задачи.')
          ? current
          : [...current, 'WebSocket недоступен, продолжаю через polling статуса задачи.'],
      ),
    onMessage: (event) => {
      if (event.jobId && generationJobId && event.jobId !== generationJobId) {
        return
      }
      if (event.type === 'modification.progress') {
        const label = [
          typeof event.payload.progress === 'number' ? `готово ${Math.round(event.payload.progress * 100)}%` : null,
          event.payload.message ?? null,
        ]
          .filter(Boolean)
          .join(' | ')
        if (label) {
          setLogs((current) => [...current, label])
        }
      }
      if (event.type === 'task.completed' && generationJobId && event.jobId === generationJobId) {
        setSession({ workflowStage: 'review', generationJobId: null })
      }
      if (event.type === 'task.failed' && generationJobId && event.jobId === generationJobId) {
        setSession({ generationJobId: null })
        setErrorMessage(event.payload.message ?? 'Модификация завершилась с ошибкой.')
      }
    },
  })

  useEffect(() => {
    if (!taskStatusQuery.error) {
      return
    }
    setSession({ generationJobId: null })
    setErrorMessage(getErrorMessage(taskStatusQuery.error))
  }, [setSession, taskStatusQuery.error])

  useEffect(() => {
    if (!generationJobId || !taskStatusQuery.data) {
      return
    }
    const { status, progress, message, error } = taskStatusQuery.data
    const resolvedMessage = error?.message ?? message ?? null
    const snapshot = [status, progress ?? 'null', resolvedMessage ?? ''].join('|')
    if (snapshot === taskSnapshotRef.current) {
      return
    }
    taskSnapshotRef.current = snapshot
    if (status === 'pending' || status === 'running') {
      const label = [typeof progress === 'number' ? `готово ${Math.round(progress * 100)}%` : null, resolvedMessage]
        .filter(Boolean)
        .join(' | ')
      if (label) {
        setLogs((current) => [...current, label])
      }
      return
    }
    if (status === 'success') {
      setSession({ workflowStage: 'review', generationJobId: null })
      return
    }
    if (status === 'error' || status === 'cancelled') {
      setSession({ generationJobId: null })
      setErrorMessage(resolvedMessage ?? 'Модификация завершилась с ошибкой.')
    }
  }, [generationJobId, setSession, taskStatusQuery.data])

  const fields = useMemo(() => configQuery.data?.fields ?? [], [configQuery.data?.fields])
  const priorityFields = useMemo(() => fields.filter((field) => PRIORITY_FIELD_KEYS.includes(field.key)), [fields])
  const secondaryFields = useMemo(() => fields.filter((field) => !HIDDEN_SECONDARY_KEYS.includes(field.key)), [fields])

  const sourceItems = useMemo<ModificationSourceAsset[]>(() => {
    if (!sourceQuery.data) {
      return []
    }
    return sourceQuery.data.items.length > 0
      ? adaptModificationSourceItems(sourceQuery.data.items)
      : [adaptModificationSource(sourceQuery.data.assetId, sourceQuery.data.previewPath, sourceQuery.data.className)]
  }, [sourceQuery.data])

  useEffect(() => {
    if (sourceItems.length === 0) {
      setSelectedSourceAssetId(null)
      setSelectedSourceIds({})
      return
    }
    setSelectedSourceIds((current) => {
      const next: Record<string, boolean> = {}
      let hasKnownSelection = false
      for (const item of sourceItems) {
        const selected = current[item.assetId]
        if (selected !== undefined) {
          next[item.assetId] = selected
          hasKnownSelection = true
        } else {
          next[item.assetId] = true
        }
      }
      return hasKnownSelection ? next : Object.fromEntries(sourceItems.map((item) => [item.assetId, true]))
    })
    if (!selectedSourceAssetId || !sourceItems.some((item) => item.assetId === selectedSourceAssetId)) {
      setSelectedSourceAssetId(sourceItems[0].assetId)
    }
  }, [selectedSourceAssetId, sourceItems])

  const selectedSourceItems = useMemo(
    () => sourceItems.filter((item) => selectedSourceIds[item.assetId] !== false),
    [selectedSourceIds, sourceItems],
  )

  const source = useMemo(() => {
    if (sourceItems.length === 0) {
      return null
    }
    if (!selectedSourceAssetId) {
      return sourceItems[0]
    }
    return sourceItems.find((item) => item.assetId === selectedSourceAssetId) ?? sourceItems[0]
  }, [selectedSourceAssetId, sourceItems])

  const promptTemplates = useMemo(() => {
    return [...DEFAULT_PROMPT_TEMPLATES, ...storedPromptTemplates]
  }, [storedPromptTemplates])

  const textPromptTemplates = useMemo(
    () => promptTemplates.filter((template) => template.scope === 'text'),
    [promptTemplates],
  )

  const selectionPromptTemplates = useMemo(
    () => promptTemplates.filter((template) => template.scope === 'selection'),
    [promptTemplates],
  )

  const datasetTextTemplates = useMemo(() => datasetTemplates.textTemplates, [datasetTemplates.textTemplates])
  const datasetSelectionTemplates = useMemo(() => datasetTemplates.selectionTemplates, [datasetTemplates.selectionTemplates])
  const datasetPolygonTemplates = useMemo(() => datasetTemplates.polygonTemplates, [datasetTemplates.polygonTemplates])

  const activeSourceItems = useMemo(
    () => (launchMode === 'single' ? (source ? [source] : []) : selectedSourceItems),
    [launchMode, selectedSourceItems, source],
  )

  const sourceIndex = useMemo(
    () => (source ? sourceItems.findIndex((item) => item.assetId === source.assetId) : -1),
    [source, sourceItems],
  )

  const totalTargetCount = useMemo(
    () => Object.values(selectedClassTargets).reduce((acc, value) => acc + value, 0),
    [selectedClassTargets],
  )

  const isModificationActive =
    singleModificationMutation.isPending ||
    batchModificationMutation.isPending ||
    (Boolean(generationJobId) &&
      (taskStatusQuery.data?.status === 'pending' || taskStatusQuery.data?.status === 'running'))

  const reviewPendingCount = reviewResultsQuery.data?.items.length ?? 0
  const isReviewOpen = workflowStage === 'review'

  const areaPoints = useMemo(() => {
    if (!source) {
      return []
    }
    return applyMaskToAll ? sharedAreaPoints : areaPointsBySourceId[source.assetId] ?? []
  }, [applyMaskToAll, areaPointsBySourceId, sharedAreaPoints, source])

  const areaConfirmed = useMemo(() => {
    if (!source) {
      return false
    }
    return applyMaskToAll ? sharedAreaConfirmed : Boolean(areaConfirmedBySourceId[source.assetId])
  }, [applyMaskToAll, areaConfirmedBySourceId, sharedAreaConfirmed, source])

  useEffect(() => {
    if (!source) {
      return
    }
    const nextPrompt = applyPromptToAll ? form.getValues('prompt') : promptBySourceId[source.assetId] ?? ''
    form.setValue('prompt', nextPrompt)
  }, [applyPromptToAll, form, promptBySourceId, source])

  const updateAreaPoints = (value: AreaPoint[]) => {
    if (!source) {
      return
    }
    if (applyMaskToAll) {
      setSharedAreaPoints(value)
      setSharedAreaConfirmed(false)
      return
    }
    setAreaPointsBySourceId((current) => ({ ...current, [source.assetId]: value }))
    setAreaConfirmedBySourceId((current) => ({ ...current, [source.assetId]: false }))
  }

  const confirmArea = () => {
    if (!source) {
      return
    }
    if (applyMaskToAll) {
      setSharedAreaConfirmed(true)
      return
    }
    setAreaConfirmedBySourceId((current) => ({ ...current, [source.assetId]: true }))
  }

  const updatePromptValue = (value: string) => {
    if (applyPromptToAll) {
      form.setValue('prompt', value, { shouldDirty: true })
      return
    }
    if (!source) {
      return
    }
    setPromptBySourceId((current) => ({ ...current, [source.assetId]: value }))
    form.setValue('prompt', value, { shouldDirty: true })
  }

  const updateApplyPromptToAll = (value: boolean) => {
    setApplyPromptToAll(value)
    const currentPrompt = form.getValues('prompt')
    if (value) {
      form.setValue('prompt', currentPrompt, { shouldDirty: true })
      return
    }
    if (source) {
      setPromptBySourceId((current) => ({
        ...current,
        [source.assetId]: current[source.assetId] ?? currentPrompt,
      }))
    }
  }

  const updateApplyMaskToAll = (value: boolean) => {
    setApplyMaskToAll(value)
    if (!source) {
      return
    }
    if (value) {
      const nextSharedPoints = areaPointsBySourceId[source.assetId] ?? sharedAreaPoints
      const nextSharedConfirmed = areaConfirmedBySourceId[source.assetId] ?? sharedAreaConfirmed
      if (nextSharedPoints.length > 0) {
        setSharedAreaPoints(nextSharedPoints)
      }
      setSharedAreaConfirmed(Boolean(nextSharedConfirmed))
      return
    }
    setAreaPointsBySourceId((current) => ({
      ...current,
      [source.assetId]: current[source.assetId] ?? sharedAreaPoints,
    }))
    setAreaConfirmedBySourceId((current) => ({
      ...current,
      [source.assetId]: current[source.assetId] ?? sharedAreaConfirmed,
    }))
  }

  const updateFieldValue = (key: string, value: string) => {
    const nextValues = { ...fieldValues, [key]: value }
    setFieldValues(nextValues)
    setSession({ generationConfig: nextValues })
  }

  const savePromptTemplate = (scope: PromptTemplate['scope']) => {
    const name = window.prompt(scope === 'text' ? 'Название шаблона текста' : 'Название шаблона выделения')
    if (!name || !name.trim()) {
      return
    }
    const nextTemplate: PromptTemplate =
      scope === 'text'
        ? {
            id: `user:${Date.now()}`,
            name: name.trim(),
            scope,
            text: form.getValues('prompt').trim(),
            negativeText: (fieldValues.negative_prompt ?? '').trim() || undefined,
          }
        : {
            id: `user:${Date.now()}`,
            name: name.trim(),
            scope,
            text: (fieldValues.sam_prompt ?? '').trim(),
          }
    if (!nextTemplate.text) {
      setErrorMessage(scope === 'text' ? 'Сначала задай текст промпта для шаблона.' : 'Сначала задай SAM prompt для шаблона.')
      return
    }
    setSession({ promptTemplates: [...storedPromptTemplates, nextTemplate] })
  }

  const applyPromptTemplate = (template: PromptTemplate) => {
    if (template.scope === 'text') {
      const nextPrompt = interpolateTemplateText(template.text, source)
      updatePromptValue(nextPrompt)
      if (template.negativeText) {
        updateFieldValue('negative_prompt', interpolateTemplateText(template.negativeText, source))
      }
      return
    }
    updateFieldValue('sam_prompt', interpolateTemplateText(template.text, source))
  }

  const deletePromptTemplate = (templateId: string) => {
    setSession({ promptTemplates: storedPromptTemplates.filter((template) => template.id !== templateId) })
  }

  const createDatasetTextTemplate = async (name: string) => {
    const prompt = form.getValues('prompt').trim()
    if (!prompt) {
      setErrorMessage('Сначала заполни основной prompt, потом сохраняй текстовый шаблон.')
      return
    }
    try {
      await createTextTemplate(name.trim(), prompt, (fieldValues.negative_prompt ?? '').trim() || undefined)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const createDatasetSelectionTemplate = async (name: string) => {
    const text = (fieldValues.sam_prompt ?? '').trim()
    if (!text) {
      setErrorMessage('Сначала заполни SAM prompt, потом сохраняй selection template.')
      return
    }
    try {
      await createSelectionTemplate(name.trim(), text)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const createDatasetPolygonTemplate = async (name: string) => {
    if (areaPoints.length < 3 || !areaConfirmed) {
      setErrorMessage('Чтобы сохранить шаблон полигона, сначала подтверди область на изображении.')
      return
    }
    try {
      await createPolygonTemplate(name.trim(), areaPoints)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const deleteDatasetTextTemplate = async (templateId: string) => {
    try {
      await deleteTextTemplate(templateId)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const deleteDatasetSelectionTemplate = async (templateId: string) => {
    try {
      await deleteSelectionTemplate(templateId)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const deleteDatasetPolygonTemplate = async (templateId: string) => {
    try {
      await deletePolygonTemplate(templateId)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const applyDatasetTextTemplate = (template: TextPromptTemplate) => {
    updatePromptValue(interpolateTemplateText(template.prompt, source))
    updateFieldValue('negative_prompt', interpolateTemplateText(template.negativePrompt ?? '', source))
  }

  const applyDatasetSelectionTemplate = (template: SelectionPromptTemplate) => {
    updateFieldValue('sam_prompt', interpolateTemplateText(template.text, source))
  }

  const applyPolygonTemplate = (template: PolygonTemplate) => {
    updateAreaPoints(template.points)
  }

  const migrateDatasetTemplates = async () => {
    try {
      await migrateLocalTemplates()
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const startBatchFromPlanner = async (params: {
    sourceAssetIds: string[]
    textTemplateId: string | null
    polygonTemplateId: string | null
  }) => {
    if (!sessionId) {
      return
    }
    const textTemplate = datasetTextTemplates.find((template) => template.id === params.textTemplateId) ?? null
    const polygonTemplate = datasetPolygonTemplates.find((template) => template.id === params.polygonTemplateId) ?? null
    if (!textTemplate) {
      setErrorMessage('Для batch planner сначала выбери текстовый шаблон.')
      return
    }
    if (!polygonTemplate || polygonTemplate.points.length < 3) {
      setErrorMessage('Для batch planner сначала выбери шаблон полигона.')
      return
    }
    const plannedSources = sourceItems.filter((item) => params.sourceAssetIds.includes(item.assetId))
    if (plannedSources.length === 0) {
      setErrorMessage('Выбери хотя бы один источник для батчевой обработки.')
      return
    }
    try {
      const response = await batchModificationMutation.mutateAsync({
        commonPrompt: interpolateTemplateText(textTemplate.prompt, source),
        negativePrompt: interpolateTemplateText(textTemplate.negativePrompt ?? '', source) || undefined,
        config: {
          ...fieldValues,
          negative_prompt: interpolateTemplateText(textTemplate.negativePrompt ?? '', source),
          sam_prompt: '',
        },
        classTargets: selectedClassTargets,
        batchMode: 'common_mask',
        areaPoints: polygonTemplate.points,
        sources: plannedSources.map((item) => ({
          assetId: item.assetId,
          areaPoints: polygonTemplate.points,
          customPrompt: null,
        })),
      })
      setSession({ generationJobId: response.jobId })
      setLogs([`Пакет подтверждён и отправлен в очередь. Источников: ${plannedSources.length}.`])
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const moveSource = (direction: -1 | 1) => {
    if (sourceItems.length <= 1 || sourceIndex < 0) {
      return
    }
    const nextIndex = (sourceIndex + direction + sourceItems.length) % sourceItems.length
    setSelectedSourceAssetId(sourceItems[nextIndex].assetId)
  }

  const toggleSourceSelection = (assetId: string) => {
    setSelectedSourceIds((current) => {
      const nextSelected = !(current[assetId] !== false)
      const next = { ...current, [assetId]: nextSelected }
      const hasSelected = sourceItems.some((item) => next[item.assetId] !== false)
      return hasSelected ? next : current
    })
  }

  const selectAllSources = () => {
    setSelectedSourceIds(Object.fromEntries(sourceItems.map((item) => [item.assetId, true])))
  }

  const clearSourceSelection = () => {
    if (sourceItems.length === 0) {
      return
    }
    setSelectedSourceIds(Object.fromEntries(sourceItems.map((item) => [item.assetId, item.assetId === sourceItems[0].assetId])))
  }

  const focusSource = (assetId: string) => {
    if (!sourceItems.some((item) => item.assetId === assetId)) {
      return
    }
    setSelectedSourceAssetId(assetId)
  }

  const handleModeChange = (mode: ModificationMode) => {
    setModificationMode(mode)
    if (mode === 'full') {
      setSharedAreaConfirmed(false)
      setAreaConfirmedBySourceId({})
    }
  }

  const closeReview = async () => {
    setSession({ workflowStage: 'modify' })
  }

  const saveReviewToDataset = async () => {
    try {
      if (sessionId) {
        await finalizeReviewMutation.mutateAsync({ nextStage: 'modify' })
      }
      setSession({ workflowStage: 'modify', approvedItems: [], rejectedItemIds: [], generationResults: [] })
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const moveToClassifier = async () => {
    try {
      if (sessionId) {
        await finalizeReviewMutation.mutateAsync({ nextStage: 'classifier-train' })
      }
      setSession({
        workflowStage: 'classifier-train',
        classifierJobId: null,
        approvedItems: [],
        rejectedItemIds: [],
        generationResults: [],
      })
      navigate('/classifier/train')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const submitForm = form.handleSubmit(async (values) => {
    if (!sessionId) {
      return
    }
    if (activeSourceItems.length === 0) {
      setErrorMessage(
        launchMode === 'batch'
          ? 'Выбери хотя бы одно изображение для batch-модификации.'
          : 'Не удалось определить текущее изображение для модификации.',
      )
      return
    }
    if (totalTargetCount <= 0) {
      setErrorMessage('Сначала задай целевые количества по классам на этапе статистики.')
      return
    }

    const samPrompt = (fieldValues.sam_prompt ?? '').trim()
    const hasMaskPrompt = modificationMode === 'full' || samPrompt.length > 0
    if (modificationMode === 'inpaint' && !hasMaskPrompt) {
      if (launchMode === 'single') {
        if (!areaConfirmed || areaPoints.length < 3) {
          setErrorMessage('Подтверди область на текущем изображении или задай SAM prompt.')
          return
        }
      } else {
        if (applyMaskToAll && (!sharedAreaConfirmed || sharedAreaPoints.length < 3)) {
          setErrorMessage('Подтверди общую область или задай SAM prompt для batch-модификации.')
          return
        }
        if (!applyMaskToAll) {
          const missingMask = activeSourceItems.find((item) => {
            const itemPoints = areaPointsBySourceId[item.assetId] ?? []
            const itemConfirmed = areaConfirmedBySourceId[item.assetId] ?? false
            return !itemConfirmed || itemPoints.length < 3
          })
          if (missingMask) {
            setErrorMessage('Для режима индивидуальных масок нужно подтвердить область на каждом выбранном изображении.')
            return
          }
        }
      }
    }

    try {
      const response =
        launchMode === 'single'
          ? await singleModificationMutation.mutateAsync({
              prompt: values.prompt,
              sourceAssetId: activeSourceItems[0].assetId,
              sampleCount: totalTargetCount,
              classTargets: selectedClassTargets,
              config: fieldValues,
              areaPoints: modificationMode === 'inpaint' && areaConfirmed && areaPoints.length >= 3 ? areaPoints : undefined,
            })
          : await batchModificationMutation.mutateAsync({
              commonPrompt: values.prompt,
              negativePrompt: (fieldValues.negative_prompt ?? '').trim() || undefined,
              config: fieldValues,
              classTargets: selectedClassTargets,
              batchMode: applyMaskToAll || modificationMode === 'full' ? 'common_mask' : 'custom_masks',
              areaPoints:
                modificationMode === 'inpaint' && applyMaskToAll && sharedAreaConfirmed && sharedAreaPoints.length >= 3
                  ? sharedAreaPoints
                  : undefined,
              sources: activeSourceItems.map((item) => {
                const customPrompt = applyPromptToAll ? null : (promptBySourceId[item.assetId] ?? '').trim() || null
                const sourceAreaPoints =
                  modificationMode === 'inpaint' && !applyMaskToAll
                    ? areaConfirmedBySourceId[item.assetId] && (areaPointsBySourceId[item.assetId] ?? []).length >= 3
                      ? areaPointsBySourceId[item.assetId]
                      : undefined
                    : undefined
                return {
                  assetId: item.assetId,
                  areaPoints: sourceAreaPoints,
                  customPrompt,
                }
              }),
            })
      setSession({ generationJobId: response.jobId })
      setLogs(
        launchMode === 'single'
          ? [`Запуск модификации изображения отправлен на бэкенд. Источник: ${activeSourceItems[0].className}.`]
          : [`Запуск batch-модификации отправлен на бэкенд. Источников: ${activeSourceItems.length}.`],
      )
      setIsModificationModalOpen(false)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  })

  useModificationShortcuts({
    canApplyArea: modificationMode === 'inpaint' && areaPoints.length >= 3 && !areaConfirmed,
    onApplyArea: confirmArea,
    onClose: () => setIsModificationModalOpen(false),
    onMoveSource: moveSource,
    onSubmit: () => void submitForm(),
    onUndoPoint: () => updateAreaPoints(areaPoints.slice(0, -1)),
    open: isModificationModalOpen,
  })

  return {
    applyDatasetSelectionTemplate,
    applyDatasetTextTemplate,
    applyMaskToAll,
    applyPromptToAll,
    applyPromptTemplate,
    applyPolygonTemplate,
    areaConfirmed,
    areaPoints,
    closeReview,
    configQuery,
    canMigrateLocalTemplates,
    createDatasetPolygonTemplate,
    createDatasetSelectionTemplate,
    createDatasetTextTemplate,
    datasetPolygonTemplates,
    datasetSelectionTemplates,
    datasetTextTemplates,
    deleteDatasetPolygonTemplate,
    deleteDatasetSelectionTemplate,
    deleteDatasetTextTemplate,
    errorMessage,
    fieldValues,
    isModificationActive,
    isModificationModalOpen,
    isReviewOpen,
    launchMode,
    logs,
    migrateDatasetTemplates,
    modificationMode,
    moveSource,
    moveToClassifier,
    negativePromptValue: fieldValues.negative_prompt ?? '',
    priorityFields,
    reviewPendingCount,
    samPromptValue: fieldValues.sam_prompt ?? '',
    saveReviewToDataset,
    savePromptTemplate,
    secondaryFields,
    selectionPromptTemplates,
    selectedSourceCount: activeSourceItems.length,
    selectedSourceIds,
    clearSourceSelection,
    deletePromptTemplate,
    focusSource,
    selectAllSources,
    setApplyMaskToAll: updateApplyMaskToAll,
    setApplyPromptToAll: updateApplyPromptToAll,
    setAreaConfirmed: confirmArea,
    setErrorMessage,
    setIsModificationModalOpen,
    setLaunchMode,
    setModificationMode: handleModeChange,
    setSession,
    source,
    sourceIndex,
    sourceItems,
    sourceQuery,
    startBatchFromPlanner,
    submitForm,
    taskStatusQuery,
    textPromptTemplates,
    toggleSourceSelection,
    totalTargetCount,
    updateAreaPoints,
    updateFieldValue,
    updatePromptValue,
  }
}
