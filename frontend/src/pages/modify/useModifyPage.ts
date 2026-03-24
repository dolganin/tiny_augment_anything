import { useEffect, useMemo, useRef, useState } from 'react'
import { UseFormReturn } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { adaptGenerationConfig, adaptModificationSource, adaptModificationSourceItems } from '@/shared/api/adapters'
import {
  useFinalizeReviewMutation,
  useGenerationConfigQuery,
  useGenerationResultsQuery,
  useModificationSourceQuery,
  useStartModificationMutation,
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
const HIDDEN_SECONDARY_KEYS = ['sam_prompt', 'negative_prompt', ...PRIORITY_FIELD_KEYS]

export function useModifyPage({ form }: UseModifyPageParams) {
  const navigate = useNavigate()
  const sessionId = useSessionStore((state) => state.sessionId)
  const generationJobId = useSessionStore((state) => state.generationJobId)
  const generationConfig = useSessionStore((state) => state.generationConfig)
  const selectedClassTargets = useSessionStore((state) => state.selectedClassTargets)
  const workflowStage = useSessionStore((state) => state.workflowStage)
  const setSession = useSessionStore((state) => state.setSession)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(generationConfig)
  const [areaPoints, setAreaPoints] = useState<AreaPoint[]>([])
  const [areaConfirmed, setAreaConfirmed] = useState(false)
  const [selectedSourceAssetId, setSelectedSourceAssetId] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const taskSnapshotRef = useRef<string | null>(null)
  const configQuery = useGenerationConfigQuery(sessionId)
  const reviewResultsQuery = useGenerationResultsQuery(sessionId)
  const sourceQuery = useModificationSourceQuery(sessionId)
  const modificationMutation = useStartModificationMutation(sessionId ?? '')
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
        const label = [typeof event.payload.progress === 'number' ? `готово ${Math.round(event.payload.progress * 100)}%` : null, event.payload.message ?? null]
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
    modificationMutation.isPending ||
    (Boolean(generationJobId) &&
      (taskStatusQuery.data?.status === 'pending' || taskStatusQuery.data?.status === 'running'))
  const reviewPendingCount = reviewResultsQuery.data?.items.length ?? 0
  const isReviewOpen = workflowStage === 'review'

  useEffect(() => {
    setAreaPoints([])
    setAreaConfirmed(false)
  }, [source?.assetId])

  useEffect(() => {
    if (sourceItems.length === 0) {
      setSelectedSourceAssetId(null)
      return
    }
    if (!selectedSourceAssetId || !sourceItems.some((item) => item.assetId === selectedSourceAssetId)) {
      setSelectedSourceAssetId(sourceItems[0].assetId)
    }
  }, [selectedSourceAssetId, sourceItems])

  const updateAreaPoints = (value: AreaPoint[]) => {
    setAreaPoints(value)
    setAreaConfirmed(false)
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

  const closeReview = async () => {
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
    if (!sessionId || !source) {
      return
    }
    if (totalTargetCount <= 0) {
      setErrorMessage('Сначала задай целевые количества по классам на этапе статистики.')
      return
    }
    try {
      const response = await modificationMutation.mutateAsync({
        prompt: values.prompt,
        sourceAssetId: source.assetId,
        sampleCount: totalTargetCount,
        classTargets: selectedClassTargets,
        config: fieldValues,
        areaPoints: areaConfirmed && areaPoints.length >= 3 ? areaPoints : undefined,
      })
      setSession({ generationJobId: response.jobId })
      setLogs(['Запуск модификации отправлен на бэкенд.'])
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  })

  return {
    areaConfirmed,
    areaPoints,
    closeReview,
    configQuery,
    errorMessage,
    fieldValues,
    isModificationActive,
    isReviewOpen,
    logs,
    moveSource,
    moveToClassifier,
    negativePromptValue: fieldValues.negative_prompt ?? '',
    priorityFields,
    reviewPendingCount,
    samPromptValue: fieldValues.sam_prompt ?? '',
    secondaryFields,
    setAreaConfirmed,
    setErrorMessage,
    setSession,
    source,
    sourceIndex,
    sourceItems,
    sourceQuery,
    submitForm,
    taskStatusQuery,
    totalTargetCount,
    updateAreaPoints,
    updateFieldValue,
  }
}
