import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { adaptClassifierSummary } from '@/shared/api/adapters'
import { useClassifierSummaryQuery, useStartClassifierTrainingMutation } from '@/shared/api/workflow.hooks'
import { type PersistedClassifierWeightsUploadSession } from '@/shared/lib/classifier-weights-upload-storage'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { Modal } from '@/shared/ui/feedback/Modal'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { type UploadedClassifierWeights } from '@/shared/types/workflow'
import { useSessionStore } from '@/store/session/session.store'
import { ClassifierTrainForm } from '@/pages/classifier-train/ClassifierTrainForm'
import { type ClassifierFormValues } from '@/pages/classifier-train/classifier-train.types'
import { useClassifierWeightsUpload } from '@/pages/classifier-train/useClassifierWeightsUpload'
import '@/features/generation-config/generation-config.css'

export function ClassifierTrainPage() {
  const navigate = useNavigate()
  const sessionId = useSessionStore((state) => state.sessionId)
  const classifierJobId = useSessionStore((state) => state.classifierJobId)
  const setSession = useSessionStore((state) => state.setSession)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const classifierMutation = useStartClassifierTrainingMutation(sessionId ?? '')
  const classifierSummaryQuery = useClassifierSummaryQuery(sessionId)
  const form = useForm<ClassifierFormValues>({
    defaultValues: {
      modelKey: 'EdgeNeXt_finetune',
      trainBatchSize: 32,
      valBatchSize: 64,
      learningRate: 0.0003,
      weightDecay: 0.000001,
      epochs: 10,
    },
  })

  useEffect(() => {
    setSession({ workflowStage: 'classifier-train' })
  }, [setSession])

  useEffect(() => {
    if (classifierJobId) {
      navigate('/metrics')
    }
  }, [classifierJobId, navigate])

  const classifierSummary = classifierSummaryQuery.data ? adaptClassifierSummary(classifierSummaryQuery.data) : null

  useEffect(() => {
    if (!classifierSummaryQuery.error) {
      return
    }
    setErrorMessage(getErrorMessage(classifierSummaryQuery.error))
  }, [classifierSummaryQuery.error])

  const {
    abortUpload,
    clearWeightsSelection,
    handleWeightsChange,
    isCancelling,
    isUploadingWeights,
    openWeightsDialog,
    saveUploadedWeightsSession,
    uploadProgress,
    weightsUploadSession,
  } = useClassifierWeightsUpload({
    fileInputRef,
    isBusy: classifierMutation.isPending,
    onError: setErrorMessage,
    sessionId,
  })

  const applyUploadedWeights = async (weights: UploadedClassifierWeights) => {
    if (!sessionId) {
      setErrorMessage('Сессия потеряна. Сначала восстанови проект.')
      return
    }
    const nextSession: PersistedClassifierWeightsUploadSession = {
      id: `classifier-weights:${sessionId}`,
      phase: 'uploaded',
      file: null,
      fileName: weights.fileName,
      fileSize: 0,
      fileLastModified: 0,
      uploadId: null,
      chunkSize: null,
      totalParts: null,
      nextPart: 0,
      weightsPath: weights.weightsPath,
      updatedAt: Date.now(),
    }
    await saveUploadedWeightsSession(nextSession)
    setErrorMessage(null)
  }

  const submitForm = form.handleSubmit(async (values) => {
    if (!sessionId) {
      setErrorMessage('Сессия потеряна. Сначала восстанови проект.')
      return
    }
    if (isUploadingWeights) {
      return
    }

    try {
      const response = await classifierMutation.mutateAsync({
        payload: {
          modelKey: values.modelKey,
          trainBatchSize: values.trainBatchSize,
          valBatchSize: values.valBatchSize,
          learningRate: values.learningRate,
          weightDecay: values.weightDecay,
          epochs: values.epochs,
          pretrainedWeightsPath: weightsUploadSession?.weightsPath ?? undefined,
        },
      })
      setSession({
        classifierJobId: response.jobId,
        classifierLogs: [
          weightsUploadSession?.weightsPath
            ? `Задача обучения классификатора отправлена. Pretrain-веса ${weightsUploadSession.fileName} уже загружены.`
            : 'Задача обучения классификатора отправлена без внешних весов.',
        ],
        metrics: null,
        workflowStage: 'metrics',
      })
      setErrorMessage(null)
      navigate('/metrics')
    } catch (error) {
      if (isClassifierAbortError(error)) {
        return
      }
      setErrorMessage(getErrorMessage(error))
    }
  })

  const weightsStatusLabel = useMemo(() => {
    if (!sessionId) {
      return 'Сессия потеряна'
    }
    if (isCancelling) {
      return 'Останавливаю загрузку весов'
    }
    if (isUploadingWeights) {
      return uploadProgress >= 100 ? 'Веса на сервере, завершаю загрузку' : `Загрузка весов: ${uploadProgress}%`
    }
    if (weightsUploadSession?.phase === 'uploaded' && weightsUploadSession.weightsPath) {
      return `Веса ${weightsUploadSession.fileName} загружены`
    }
    if (weightsUploadSession?.fileName) {
      return `${weightsUploadSession.fileName} ожидает отправки`
    }
    return 'Файл весов не выбран'
  }, [isCancelling, isUploadingWeights, sessionId, uploadProgress, weightsUploadSession])

  const isSubmitDisabled =
    classifierMutation.isPending ||
    isUploadingWeights ||
    isCancelling ||
    !sessionId ||
    (weightsUploadSession !== null && weightsUploadSession.phase !== 'uploaded')

  return (
    <>
      <PageFrame description="" title="Обучение классификатора">
        <div className="info-card">
          <p className="info-card__text">
            Head checkpoint подменяется автоматически: старый classifier head не загружается.
          </p>
          <p className="info-card__text">
            Новый head собирается вне `src` каскадом <strong>backbone dim → 512 → 256 → классы текущего датасета</strong>.
          </p>
        </div>

        {!classifierJobId ? (
          <ClassifierTrainForm
            classifierSummary={classifierSummary}
            classifierSummaryLoading={classifierSummaryQuery.isLoading}
            form={form}
            isCancelling={isCancelling}
            isSubmitDisabled={isSubmitDisabled}
            isUploadingWeights={isUploadingWeights}
            onAbortUpload={() => void abortUpload()}
            onClearWeights={() => void clearWeightsSelection()}
            onWeightsApply={(weights) => void applyUploadedWeights(weights)}
            onSubmit={submitForm}
            onWeightsChange={handleWeightsChange}
            onWeightsDialogOpen={openWeightsDialog}
            selectedWeightsPath={weightsUploadSession?.weightsPath ?? null}
            submitPending={classifierMutation.isPending}
            uploadProgress={uploadProgress}
            weightsInputRef={fileInputRef}
            weightsStatusLabel={weightsStatusLabel}
            weightsUploadSession={weightsUploadSession}
          />
        ) : null}

      </PageFrame>

      <Modal
        onClose={() => setErrorMessage(null)}
        open={Boolean(errorMessage)}
        title="Ошибка обучения классификатора"
        tone="error"
      >
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>
    </>
  )
}

function isClassifierAbortError(error: unknown) {
  if (error instanceof DOMException) {
    return error.name === 'AbortError'
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code?: string }).code === 'ERR_CANCELED'
  }
  return false
}
