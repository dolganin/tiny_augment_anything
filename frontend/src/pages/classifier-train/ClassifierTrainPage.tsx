import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { adaptClassifierSummary } from '@/shared/api/adapters'
import { workflowApi } from '@/shared/api/workflow.api'
import { useClassifierSummaryQuery, useStartClassifierTrainingMutation } from '@/shared/api/workflow.hooks'
import {
  clearClassifierWeightsUploadSession,
  createClassifierWeightsUploadSession,
  loadClassifierWeightsUploadSession,
  saveClassifierWeightsUploadSession,
  type PersistedClassifierWeightsUploadSession,
} from '@/shared/lib/classifier-weights-upload-storage'
import {
  isClassifierWeightsAbortError,
  runClassifierWeightsUpload,
} from '@/shared/lib/classifier-weights-upload-runtime'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { type TrainedClassifierModel } from '@/shared/types/workflow'
import { useSessionStore } from '@/store/session/session.store'
import '@/features/generation-config/generation-config.css'

type ClassifierFormValues = {
  modelKey: string
  trainBatchSize: number
  valBatchSize: number
  learningRate: number
  weightDecay: number
  epochs: number
}

const CLASSIFIER_MODELS = [
  { value: 'EdgeNeXt_finetune', label: 'EdgeNeXt' },
  { value: 'EVA02-small_finetune', label: 'EVA02-small' },
]

export function ClassifierTrainPage() {
  const navigate = useNavigate()
  const sessionId = useSessionStore((state) => state.sessionId)
  const classifierJobId = useSessionStore((state) => state.classifierJobId)
  const setSession = useSessionStore((state) => state.setSession)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [weightsUploadSession, setWeightsUploadSession] = useState<PersistedClassifierWeightsUploadSession | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploadingWeights, setIsUploadingWeights] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadAbortRef = useRef<AbortController | null>(null)
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

  useEffect(() => {
    if (!sessionId) {
      setWeightsUploadSession(null)
      setUploadProgress(0)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const storedSession = await loadClassifierWeightsUploadSession(sessionId)
        if (cancelled || !storedSession) {
          return
        }
        setWeightsUploadSession(storedSession)
        setUploadProgress(storedSession.phase === 'uploaded' ? 100 : 0)
        if (storedSession.phase === 'uploading' && storedSession.file) {
          await resumeWeightsUpload(storedSession)
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getErrorMessage(error))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    const handleWakeup = () => {
      if (document.hidden) {
        return
      }
      if (!sessionId || isUploadingWeights || weightsUploadSession?.phase !== 'uploading' || !weightsUploadSession.file) {
        return
      }
      void resumeWeightsUpload(weightsUploadSession)
    }
    document.addEventListener('visibilitychange', handleWakeup)
    window.addEventListener('focus', handleWakeup)
    window.addEventListener('online', handleWakeup)
    return () => {
      document.removeEventListener('visibilitychange', handleWakeup)
      window.removeEventListener('focus', handleWakeup)
      window.removeEventListener('online', handleWakeup)
    }
  }, [isUploadingWeights, sessionId, weightsUploadSession])

  const resumeWeightsUpload = async (session: PersistedClassifierWeightsUploadSession) => {
    if (!sessionId) {
      setErrorMessage('Сессия потеряна. Сначала восстанови проект, потом выбери веса заново.')
      return
    }
    try {
      const controller = new AbortController()
      uploadAbortRef.current = controller
      setIsUploadingWeights(true)
      setIsCancelling(false)
      const result = await runClassifierWeightsUpload({
        sessionId,
        session,
        signal: controller.signal,
        onProgress: setUploadProgress,
      })
      setWeightsUploadSession(result.session)
      setUploadProgress(100)
      setErrorMessage(null)
    } catch (error) {
      if (isClassifierWeightsAbortError(error)) {
        return
      }
      setErrorMessage(getErrorMessage(error))
    } finally {
      uploadAbortRef.current = null
      setIsUploadingWeights(false)
      setIsCancelling(false)
    }
  }

  const clearWeightsSelection = async () => {
    if (!sessionId) {
      setWeightsUploadSession(null)
      setUploadProgress(0)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }
    const currentUploadId = weightsUploadSession?.uploadId ?? null
    if (currentUploadId) {
      try {
        await workflowApi.cancelClassifierWeightsUpload(sessionId, currentUploadId)
      } catch {
        // Best-effort cleanup for abandoned staged uploads.
      }
    }
    await clearClassifierWeightsUploadSession(sessionId)
    setWeightsUploadSession(null)
    setUploadProgress(0)
    setIsCancelling(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const startWeightsUpload = async (file: File) => {
    if (!sessionId) {
      setErrorMessage('Сессия потеряна. Сначала выбери датасет заново.')
      return
    }
    await clearWeightsSelection()
    const nextSession = createClassifierWeightsUploadSession(sessionId, file)
    setWeightsUploadSession(nextSession)
    setUploadProgress(0)
    await resumeWeightsUpload(nextSession)
  }

  const applySavedModel = async (model: TrainedClassifierModel) => {
    if (!sessionId) {
      setErrorMessage('Сессия потеряна. Сначала восстанови проект.')
      return
    }
    form.reset({
      modelKey: model.modelKey === 'EVA02-small_finetune' ? 'EVA02-small_finetune' : 'EdgeNeXt_finetune',
      trainBatchSize: Number(model.hparams.train_batch_size ?? 32),
      valBatchSize: Number(model.hparams.val_batch_size ?? 64),
      learningRate: Number(model.hparams.learning_rate ?? 0.0003),
      weightDecay: Number(model.hparams.weight_decay ?? 0.000001),
      epochs: Number(model.hparams.epochs ?? 10),
    })
    const reusableWeightsPath = model.pretrainedWeightsPath
    if (!reusableWeightsPath) {
      await clearWeightsSelection()
      return
    }
    const nextSession: PersistedClassifierWeightsUploadSession = {
      id: `classifier-weights:${sessionId}`,
      phase: 'uploaded',
      file: null,
      fileName: reusableWeightsPath.split('/').pop() ?? 'weights',
      fileSize: 0,
      fileLastModified: 0,
      uploadId: null,
      chunkSize: null,
      totalParts: null,
      nextPart: 0,
      weightsPath: reusableWeightsPath,
      updatedAt: Date.now(),
    }
    await saveClassifierWeightsUploadSession(nextSession)
    setWeightsUploadSession(nextSession)
    setUploadProgress(100)
    setErrorMessage(null)
  }

  const handleWeightsChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      return
    }
    void startWeightsUpload(file)
  }

  const openWeightsDialog = () => {
    if (classifierMutation.isPending || isUploadingWeights || isCancelling) {
      return
    }
    fileInputRef.current?.click()
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
      const controller = new AbortController()
      uploadAbortRef.current = controller
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
        signal: controller.signal,
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
    } finally {
      uploadAbortRef.current = null
    }
  })

  const abortUpload = async () => {
    if (!sessionId) {
      return
    }
    setIsCancelling(true)
    uploadAbortRef.current?.abort()
    uploadAbortRef.current = null
    await clearWeightsSelection()
  }

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
          <form className="generation-form generation-form--stacked classifier-train-layout" onSubmit={submitForm}>
            <label className="generation-form__group classifier-train-layout__full">
              <span className="generation-form__label">Модель классификатора</span>
              <select className="generation-form__input" {...form.register('modelKey', { required: true })}>
                {CLASSIFIER_MODELS.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="generation-form__group classifier-train-layout__full">
              <span className="generation-form__label">Pretrain-веса (опционально)</span>
              <div className="upload-stage upload-stage--compact classifier-weights">
                <input
                  accept=".bin,.ckpt,.pt,.pth,.safetensors"
                  className="upload-stage__input"
                  onChange={handleWeightsChange}
                  ref={fileInputRef}
                  type="file"
                />
                <button
                  className="upload-stage__dropzone classifier-weights__dropzone"
                  disabled={classifierMutation.isPending || isUploadingWeights || isCancelling}
                  onClick={openWeightsDialog}
                  type="button"
                >
                  <WeightUploadIllustration />
                  <span className="upload-stage__title">
                    {weightsUploadSession?.phase === 'uploaded' ? 'Веса загружены' : weightsUploadSession ? 'Идёт загрузка' : 'Выбрать веса'}
                  </span>
                  <span className="upload-stage__hint">
                    {weightsUploadSession
                      ? weightsUploadSession.phase === 'uploaded'
                        ? `${weightsUploadSession.fileName} уже на сервере и готов к обучению.`
                        : `Передаю ${weightsUploadSession.fileName} на сервер.`
                      : 'Поддерживаются .bin, .ckpt, .pt, .pth, .safetensors. Можно пропустить.'}
                  </span>
                </button>
                {isUploadingWeights || isCancelling ? (
                  <div className="upload-stage__loading">
                    <div className="upload-stage__loading-head">
                      <Spinner label={weightsStatusLabel} />
                      <button
                        aria-label="Сбросить загрузку весов"
                        className="upload-stage__abort"
                        onClick={abortUpload}
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                    <div className="upload-stage__progress">
                      <div
                        className="upload-stage__progress-bar"
                        style={{ width: `${Math.max(uploadProgress, 8)}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </label>

            <label className="generation-form__group">
              <span className="generation-form__label">Train batch size</span>
              <input
                className="generation-form__input"
                min={1}
                step={1}
                type="number"
                {...form.register('trainBatchSize', { required: true, min: 1, valueAsNumber: true })}
              />
            </label>

            <label className="generation-form__group">
              <span className="generation-form__label">Val batch size</span>
              <input
                className="generation-form__input"
                min={1}
                step={1}
                type="number"
                {...form.register('valBatchSize', { required: true, min: 1, valueAsNumber: true })}
              />
            </label>

            <label className="generation-form__group">
              <span className="generation-form__label">Learning rate</span>
              <input
                className="generation-form__input"
                min={0.000001}
                step={0.000001}
                type="number"
                {...form.register('learningRate', { required: true, min: 0.000001, valueAsNumber: true })}
              />
            </label>

            <label className="generation-form__group">
              <span className="generation-form__label">Weight decay</span>
              <input
                className="generation-form__input"
                min={0}
                step={0.000001}
                type="number"
                {...form.register('weightDecay', { required: true, min: 0, valueAsNumber: true })}
              />
            </label>

            <label className="generation-form__group classifier-train-layout__half">
              <span className="generation-form__label">Epochs</span>
              <input
                className="generation-form__input"
                min={1}
                step={1}
                type="number"
                {...form.register('epochs', { required: true, min: 1, valueAsNumber: true })}
              />
            </label>

            <div className="info-card classifier-train-layout__full">
              <p className="info-card__text">
                Статус весов: <strong>{weightsStatusLabel}</strong>
              </p>
              <p className="info-card__text">
                Если веса не загрузить, запуск пойдёт на базовой инициализации выбранной модели.
              </p>
              <p className="info-card__text">
                Валидация собирается только из исходных изображений, синтетика в неё не попадает.
              </p>
              <p className="info-card__text">
                По классам берётся максимально ровный val split, а в train остаются остаток originals и вся синтетика.
              </p>
            </div>

            <section className="info-card classifier-train-layout__full classifier-summary-card">
              <div className="classifier-summary-card__head">
                <h3 className="classifier-summary-card__title">Разбиение train / val</h3>
                {classifierSummaryQuery.isLoading ? <Spinner label="Считаю layout датасета" /> : null}
              </div>
              {classifierSummary?.split.error ? (
                <p className="info-card__text">{classifierSummary.split.error}</p>
              ) : (
                <>
                  <div className="classifier-summary-card__totals">
                    <span>Классов: {classifierSummary?.split.classCount ?? 0}</span>
                    <span>Train: {classifierSummary?.split.trainCount ?? 0}</span>
                    <span>Val: {classifierSummary?.split.valCount ?? 0}</span>
                  </div>
                  <div className="classifier-split-table">
                    <div className="classifier-split-table__row classifier-split-table__row--head">
                      <span>Класс</span>
                      <span>Original</span>
                      <span>Synth</span>
                      <span>Train</span>
                      <span>Val</span>
                    </div>
                    {(classifierSummary?.split.perClass ?? []).map((item) => (
                      <div className="classifier-split-table__row" key={item.className}>
                        <span>{item.className}</span>
                        <span>{item.originalCount}</span>
                        <span>{item.syntheticCount}</span>
                        <span>{item.trainCount}</span>
                        <span>{item.valCount}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="info-card classifier-train-layout__full classifier-model-history">
              <div className="classifier-summary-card__head">
                <h3 className="classifier-summary-card__title">Сохранённые модели датасета</h3>
              </div>
              {(classifierSummary?.models ?? []).length === 0 ? (
                <p className="info-card__text">Для этого датасета ещё не сохранено ни одной конфигурации классификатора.</p>
              ) : (
                <div className="classifier-model-history__list">
                  {(classifierSummary?.models ?? []).map((model) => (
                    <article className="classifier-model-card" key={model.id}>
                      <div className="classifier-model-card__meta">
                        <strong>{model.modelKey ?? 'Classifier run'}</strong>
                        <span>{model.status}</span>
                      </div>
                      <p className="classifier-model-card__line">
                        Классы: {model.classNames.length > 0 ? model.classNames.join(', ') : 'не сохранены'}
                      </p>
                      <p className="classifier-model-card__line">
                        Веса: {(model.pretrainedWeightsPath ?? 'нет').split('/').pop()}
                      </p>
                      <p className="classifier-model-card__line">
                        Batch train/val: {Number(model.hparams.train_batch_size ?? 32)} / {Number(model.hparams.val_batch_size ?? 64)}
                      </p>
                      <div className="classifier-model-card__actions">
                        <Button
                          disabled={!model.pretrainedWeightsPath}
                          onClick={() => void applySavedModel(model)}
                          type="button"
                          variant="ghost"
                        >
                          Использовать
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <div className="classifier-train-layout__actions classifier-train-layout__full">
              <Button disabled={isSubmitDisabled || Boolean(classifierSummary?.split.error)} type="submit">
                Запустить обучение
              </Button>
              {weightsUploadSession ? (
                <Button disabled={classifierMutation.isPending || isUploadingWeights} onClick={() => void clearWeightsSelection()} type="button" variant="ghost">
                  Сбросить веса
                </Button>
              ) : null}
            </div>
          </form>
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

function WeightUploadIllustration() {
  return (
    <svg aria-hidden="true" className="upload-stage__icon" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="classifierWeightsGradient" x1="16" x2="102" y1="18" y2="106" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2f9e6f" />
          <stop offset="1" stopColor="#1d2967" />
        </linearGradient>
      </defs>
      <rect x="18" y="20" width="84" height="80" rx="22" fill="url(#classifierWeightsGradient)" opacity="0.12" />
      <path
        d="M39 69.5L60 47l21 22.5M60 47v34"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />
      <rect x="33" y="82" width="54" height="8" rx="4" fill="currentColor" opacity="0.78" />
    </svg>
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
