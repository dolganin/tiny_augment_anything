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
  useTaskStatusQuery,
} from '@/shared/api/workflow.hooks'
import { useWorkflowSocket } from '@/shared/api/workflow.socket'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { ModificationSourceAsset } from '@/shared/types/workflow'
import { useSessionStore } from '@/store/session/session.store'
import { type AreaPoint, type ModifyFormValues } from '@/pages/modify/modify.types'

type UseModifyPageParams = {
  form: UseFormReturn<ModifyFormValues>
}

const PRIORITY_FIELD_KEYS = ['size', 'strength', 'inpaint_strength', 'num_inference_steps', 'guidance_scale']
const HIDDEN_SECONDARY_KEYS = ['sam_prompt', 'negative_prompt', 'lora_path', ...PRIORITY_FIELD_KEYS]

export function useModifyPage({ form }: UseModifyPageParams) {
  const navigate = useNavigate()
  const sessionId = useSessionStore((state) => state.sessionId)
  const generationJobId = useSessionStore((state) => state.generationJobId)
  const generationConfig = useSessionStore((state) => state.generationConfig)
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
  const [modificationMode, setModificationMode] = useState<ModificationMode>('inpaint')
  const [applyPromptToAll, setApplyPromptToAll] = useState(true)
  const [applyMaskToAll, setApplyMaskToAll] = useState(true)
  const [promptBySourceId, setPromptBySourceId] = useState<Record<string, string>>({})
  const taskSnapshotRef = useRef<string | null>(null)

  const configQuery = useGenerationConfigQuery(sessionId)
  const reviewResultsQuery = useGenerationResultsQuery(sessionId)
  const sourceQuery = useModificationSourceQuery(sessionId)
  const batchModificationMutation = useStartBatchModificationMutation(sessionId ?? '')
  const finalizeReviewMutation = useFinalizeReviewMutation(sessionId ?? '')
  const taskStatusQuery = useTaskStatusQuery(sessionId, generationJobId)

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

  const sourceIndex = useMemo(
    () => (source ? sourceItems.findIndex((item) => item.assetId === source.assetId) : -1),
    [source, sourceItems],
  )

  const totalTargetCount = useMemo(
    () => Object.values(selectedClassTargets).reduce((acc, value) => acc + value, 0),
    [selectedClassTargets],
  )

  const isModificationActive =
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
    if (selectedSourceItems.length === 0) {
      setErrorMessage('Выбери хотя бы одно изображение для batch-модификации.')
      return
    }
    if (totalTargetCount <= 0) {
      setErrorMessage('Сначала задай целевые количества по классам на этапе статистики.')
      return
    }

    const samPrompt = (fieldValues.sam_prompt ?? '').trim()
    const hasMaskPrompt = modificationMode === 'full' || samPrompt.length > 0
    if (modificationMode === 'inpaint' && !hasMaskPrompt) {
      if (applyMaskToAll && (!sharedAreaConfirmed || sharedAreaPoints.length < 3)) {
        setErrorMessage('Подтверди общую область или задай SAM prompt для batch-модификации.')
        return
      }
      if (!applyMaskToAll) {
        const missingMask = selectedSourceItems.find((item) => {
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

    try {
      const response = await batchModificationMutation.mutateAsync({
        commonPrompt: values.prompt,
        negativePrompt: (fieldValues.negative_prompt ?? '').trim() || undefined,
        config: fieldValues,
        classTargets: selectedClassTargets,
        batchMode: applyMaskToAll || modificationMode === 'full' ? 'common_mask' : 'custom_masks',
        areaPoints:
          modificationMode === 'inpaint' && applyMaskToAll && sharedAreaConfirmed && sharedAreaPoints.length >= 3
            ? sharedAreaPoints
            : undefined,
        sources: selectedSourceItems.map((item) => {
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
      setLogs([
        `Запуск batch-модификации отправлен на бэкенд. Источников: ${selectedSourceItems.length}.`,
      ])
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
    applyMaskToAll,
    applyPromptToAll,
    areaConfirmed,
    areaPoints,
    closeReview,
    configQuery,
    errorMessage,
    fieldValues,
    isModificationActive,
    isModificationModalOpen,
    isReviewOpen,
    logs,
    modificationMode,
    moveSource,
    moveToClassifier,
    negativePromptValue: fieldValues.negative_prompt ?? '',
    priorityFields,
    reviewPendingCount,
    samPromptValue: fieldValues.sam_prompt ?? '',
    saveReviewToDataset,
    secondaryFields,
    selectedSourceCount: selectedSourceItems.length,
    selectedSourceIds,
    setApplyMaskToAll: updateApplyMaskToAll,
    setApplyPromptToAll: updateApplyPromptToAll,
    setAreaConfirmed: confirmArea,
    setErrorMessage,
    setIsModificationModalOpen,
    setModificationMode: handleModeChange,
    setSession,
    source,
    sourceIndex,
    sourceItems,
    sourceQuery,
    submitForm,
    taskStatusQuery,
    toggleSourceSelection,
    totalTargetCount,
    updateAreaPoints,
    updateFieldValue,
    updatePromptValue,
  }
}
