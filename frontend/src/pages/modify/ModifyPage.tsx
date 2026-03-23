import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
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
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { useSessionStore } from '@/store/session/session.store'
import { TrainingLogPanel } from '@/features/fine-tune-training/TrainingLogPanel'
import { GenerationConfigFields } from '@/features/generation-config/GenerationConfigFields'
import { ReviewWorkspace } from '@/features/generation-review/ReviewWorkspace'
import { ModificationCanvas } from '@/features/modification/ModificationCanvas'
import { ModificationSourceAsset } from '@/shared/types/workflow'
import '@/features/generation-config/generation-config.css'

type ModifyFormValues = {
  prompt: string
}

type AreaPoint = [number, number]

export function ModifyPage() {
  const navigate = useNavigate()
  const sessionId = useSessionStore((state) => state.sessionId)
  const generationJobId = useSessionStore((state) => state.generationJobId)
  const generationConfig = useSessionStore((state) => state.generationConfig)
  const selectedClassTargets = useSessionStore((state) => state.selectedClassTargets)
  const fineTuneEnabled = useSessionStore((state) => state.fineTuneEnabled)
  const fineTuneResolved = useSessionStore((state) => state.fineTuneResolved)
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
  const form = useForm<ModifyFormValues>({
    defaultValues: {
      prompt: '',
    },
  })

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
    form.reset({
      prompt: '',
    })
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
        const { progress, message } = event.payload
        const label = [
          typeof progress === 'number' ? `готово ${Math.round(progress * 100)}%` : null,
          message ?? null,
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
      const label = [
        typeof progress === 'number' ? `готово ${Math.round(progress * 100)}%` : null,
        resolvedMessage,
      ]
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
  const samPromptValue = fieldValues.sam_prompt ?? ''
  const negativePromptValue = fieldValues.negative_prompt ?? ''
  const priorityFields = useMemo(
    () =>
      fields.filter((field) =>
        ['size', 'strength', 'inpaint_strength', 'num_inference_steps', 'guidance_scale'].includes(
          field.key,
        ),
      ),
    [fields],
  )
  const secondaryFields = useMemo(
    () =>
      fields.filter(
        (field) =>
          ![
            'sam_prompt',
            'negative_prompt',
            'size',
            'strength',
            'inpaint_strength',
            'num_inference_steps',
            'guidance_scale',
          ].includes(field.key),
      ),
    [fields],
  )
  const sourceItems = useMemo<ModificationSourceAsset[]>(() => {
    if (!sourceQuery.data) {
      return []
    }
    const items =
      sourceQuery.data.items.length > 0
        ? adaptModificationSourceItems(sourceQuery.data.items)
        : [
            adaptModificationSource(
              sourceQuery.data.assetId,
              sourceQuery.data.previewPath,
              sourceQuery.data.className,
            ),
          ]
    return items
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
  const sourceIndex = useMemo(() => {
    if (!source) {
      return -1
    }
    return sourceItems.findIndex((item) => item.assetId === source.assetId)
  }, [source, sourceItems])
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
      setSession({
        workflowStage: 'modify',
        fineTuneEnabled,
        fineTuneResolved,
        approvedItems: [],
        rejectedItemIds: [],
        generationResults: [],
      })
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

  return (
    <>
      <PageFrame
        title="Модификация"
      >
        {(configQuery.isLoading || sourceQuery.isLoading) && (
          <div className="upload-stage__loading">
            <Spinner label="Подтягиваю изображение и параметры модификации." />
          </div>
        )}

        {!configQuery.isLoading && !sourceQuery.isLoading && source ? (
          <form className="modify-layout modify-workbench" onSubmit={submitForm}>
            <section className="generation-form generation-form--stacked modify-panel modify-panel--primary">
              <label className="generation-form__group">
                <span className="generation-form__label">Промпт модификации</span>
                <textarea
                  className="generation-form__textarea generation-form__textarea--hero"
                  placeholder="Опиши, какую вариацию нужно получить на основе этого изображения."
                  {...form.register('prompt', { required: true })}
                />
              </label>

              <label className="generation-form__group">
                <span className="generation-form__label">Negative prompt</span>
                <textarea
                  className="generation-form__textarea"
                  onChange={(event) => updateFieldValue('negative_prompt', event.target.value)}
                  placeholder="Опиши, чего не должно быть в результате."
                  value={negativePromptValue}
                />
              </label>

              <label className="generation-form__group">
                <span className="generation-form__label">SAM prompt</span>
                <textarea
                  className="generation-form__textarea modify-workbench__sam-prompt"
                  onChange={(event) => updateFieldValue('sam_prompt', event.target.value)}
                  placeholder="Опиши область для текстовой сегментации, если хочешь использовать SAM по тексту вместо полигона."
                  value={samPromptValue}
                />
              </label>

              <div className="info-card">
                <p className="info-card__text">
                  План генерации взят со страницы статистики: <strong>{totalTargetCount}</strong> изображений суммарно.
                </p>
                <p className="info-card__text">
                  Источник: <strong>{source.className}</strong>
                </p>
              </div>

              <div className="modify-panel__actions">
                <Button disabled={modificationMutation.isPending} type="submit">
                  Запустить модификацию
                </Button>
                {reviewPendingCount > 0 && !isReviewOpen ? (
                  <Button
                    onClick={() => setSession({ workflowStage: 'review' })}
                    type="button"
                    variant="secondary"
                  >
                    Открыть отбор ({reviewPendingCount})
                  </Button>
                ) : null}
              </div>
            </section>

            <div className="modify-layout__viewer">
              <ModificationCanvas
                areaConfirmed={areaConfirmed}
                areaPoints={areaPoints}
                className={source.className}
                imageUrl={source.assetUrl}
                onAreaPointsChange={updateAreaPoints}
              />
              <div className="modify-source-nav">
                <Button
                  disabled={sourceItems.length <= 1}
                  onClick={() => moveSource(-1)}
                  type="button"
                  variant="ghost"
                >
                  Предыдущее
                </Button>
                <span className="modify-source-nav__status">
                  {sourceIndex + 1} / {sourceItems.length}
                </span>
                <Button
                  disabled={sourceItems.length <= 1}
                  onClick={() => moveSource(1)}
                  type="button"
                  variant="ghost"
                >
                  Следующее
                </Button>
              </div>

            </div>

            <section className="generation-form generation-form--stacked modify-controls modify-panel modify-panel--secondary">
              {priorityFields.length > 0 ? (
                <div className="generation-form generation-form--stacked modify-panel modify-panel--inline">
                  <GenerationConfigFields fields={priorityFields} onChange={updateFieldValue} values={fieldValues} />
                </div>
              ) : null}
              <div className="modify-controls__actions">
                <Button
                  disabled={areaPoints.length < 3 || areaConfirmed}
                  onClick={() => setAreaConfirmed(true)}
                  type="button"
                >
                  Применить область
                </Button>
                <Button
                  disabled={areaPoints.length === 0}
                  onClick={() => {
                    updateAreaPoints(areaPoints.slice(0, -1))
                  }}
                  type="button"
                  variant="ghost"
                >
                  Удалить вершину
                </Button>
                <Button
                  disabled={areaPoints.length === 0}
                  onClick={() => {
                    updateAreaPoints([])
                  }}
                  type="button"
                  variant="ghost"
                >
                  Очистить полигон
                </Button>
              </div>

              {secondaryFields.length > 0 ? (
                <GenerationConfigFields fields={secondaryFields} onChange={updateFieldValue} values={fieldValues} />
              ) : null}
            </section>
          </form>
        ) : null}

        {isModificationActive && !errorMessage ? (
          <div className="upload-stage__loading">
            <Spinner
              label="Модификация выполняется. После завершения откроется модалка отбора."
              tone="diffusion"
            />
          </div>
        ) : null}

        <TrainingLogPanel
          emptyLabel="Логи модификации появятся после запуска задачи."
          logs={logs}
          title="Поток логов модификации"
        />
      </PageFrame>

      <Modal
        onClose={() => setErrorMessage(null)}
        open={Boolean(errorMessage)}
        title="Ошибка модификации"
        tone="error"
      >
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>

      <ReviewWorkspace
        onClose={() => void closeReview()}
        onStartClassifier={() => void moveToClassifier()}
        open={isReviewOpen}
      />
    </>
  )
}
