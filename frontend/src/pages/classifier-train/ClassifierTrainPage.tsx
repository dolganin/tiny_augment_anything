import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useStartClassifierTrainingMutation } from '@/shared/api/workflow.hooks'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
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
  const [weightsFile, setWeightsFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const classifierMutation = useStartClassifierTrainingMutation(sessionId ?? '')
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

  const handleWeightsChange = (event: ChangeEvent<HTMLInputElement>) => {
    setWeightsFile(event.target.files?.[0] ?? null)
  }

  const openWeightsDialog = () => {
    if (classifierMutation.isPending) {
      return
    }
    fileInputRef.current?.click()
  }

  const submitForm = form.handleSubmit(async (values) => {
    if (!sessionId) {
      return
    }

    const payload = new FormData()
    payload.append('modelKey', values.modelKey)
    payload.append('trainBatchSize', String(values.trainBatchSize))
    payload.append('valBatchSize', String(values.valBatchSize))
    payload.append('learningRate', String(values.learningRate))
    payload.append('weightDecay', String(values.weightDecay))
    payload.append('epochs', String(values.epochs))
    if (weightsFile) {
      payload.append('weights', weightsFile)
    }

    try {
      const response = await classifierMutation.mutateAsync(payload)
      setSession({
        classifierJobId: response.jobId,
        classifierLogs: [
          weightsFile
            ? `Задача обучения классификатора отправлена. Загружены веса ${weightsFile.name}.`
            : 'Задача обучения классификатора отправлена без внешних весов.',
        ],
        metrics: null,
        workflowStage: 'metrics',
      })
      setErrorMessage(null)
      navigate('/metrics')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  })

  return (
    <>
      <PageFrame title="Обучение классификатора">
        <div className="info-card">
          <p className="info-card__text">
            Head checkpoint подменяется автоматически: старый classifier head не загружается.
          </p>
          <p className="info-card__text">
            Новый head собирается вне `src` каскадом <strong>backbone dim → 512 → 256 → классы текущего датасета</strong>.
          </p>
        </div>

        {!classifierJobId ? (
          <form className="generation-form generation-form--stacked" onSubmit={submitForm}>
            <label className="generation-form__group">
              <span className="generation-form__label">Модель классификатора</span>
              <select className="generation-form__input" {...form.register('modelKey', { required: true })}>
                {CLASSIFIER_MODELS.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="generation-form__group">
              <span className="generation-form__label">Pretrain-веса (опционально)</span>
              <div className="upload-stage upload-stage--compact classifier-weights">
                <input
                  accept=".bin,.ckpt,.pt,.pth"
                  className="upload-stage__input"
                  onChange={handleWeightsChange}
                  ref={fileInputRef}
                  type="file"
                />
                <button
                  className="upload-stage__dropzone classifier-weights__dropzone"
                  disabled={classifierMutation.isPending}
                  onClick={openWeightsDialog}
                  type="button"
                >
                  <WeightUploadIllustration />
                  <span className="upload-stage__title">
                    {weightsFile ? 'Файл выбран' : 'Выбрать веса'}
                  </span>
                  <span className="upload-stage__hint">
                    {weightsFile
                      ? `${weightsFile.name} готов к запуску обучения.`
                      : 'Поддерживаются .bin, .ckpt, .pt, .pth. Можно пропустить.'}
                  </span>
                </button>
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

            <label className="generation-form__group">
              <span className="generation-form__label">Epochs</span>
              <input
                className="generation-form__input"
                min={1}
                step={1}
                type="number"
                {...form.register('epochs', { required: true, min: 1, valueAsNumber: true })}
              />
            </label>

            <div className="info-card">
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

            <Button disabled={classifierMutation.isPending} type="submit">
              Запустить обучение
            </Button>
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
