import { ChangeEvent, RefObject } from 'react'
import { UseFormReturn } from 'react-hook-form'
import { Button } from '@/shared/ui/buttons/Button'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { type UploadedClassifierWeights } from '@/shared/types/workflow'
import { CLASSIFIER_MODELS } from '@/pages/classifier-train/classifier-train.constants'
import { type ClassifierFormValues } from '@/pages/classifier-train/classifier-train.types'
import {
  ClassifierModelHistory,
  ClassifierSplitSummaryCard,
} from '@/pages/classifier-train/ClassifierTrainSections'
import { type PersistedClassifierWeightsUploadSession } from '@/shared/lib/classifier-weights-upload-storage'

type ClassifierTrainFormProps = {
  classifierSummary: {
    split: {
      classCount: number
      trainCount: number
      valCount: number
      perClass: Array<{
        className: string
        originalCount: number
        syntheticCount: number
        trainCount: number
        valCount: number
      }>
      error: string | null
    }
    uploadedWeights: UploadedClassifierWeights[]
  } | null
  classifierSummaryLoading: boolean
  form: UseFormReturn<ClassifierFormValues>
  isCancelling: boolean
  isSubmitDisabled: boolean
  isUploadingWeights: boolean
  onAbortUpload: () => void
  onClearWeights: () => void
  onWeightsApply: (weights: UploadedClassifierWeights) => void
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onWeightsChange: (event: ChangeEvent<HTMLInputElement>) => void
  onWeightsDialogOpen: () => void
  submitPending: boolean
  uploadProgress: number
  selectedWeightsPath: string | null
  weightsInputRef: RefObject<HTMLInputElement | null>
  weightsStatusLabel: string
  weightsUploadSession: PersistedClassifierWeightsUploadSession | null
}

export function ClassifierTrainForm({
  classifierSummary,
  classifierSummaryLoading,
  form,
  isCancelling,
  isSubmitDisabled,
  isUploadingWeights,
  onAbortUpload,
  onClearWeights,
  onWeightsApply,
  onSubmit,
  onWeightsChange,
  onWeightsDialogOpen,
  submitPending,
  uploadProgress,
  selectedWeightsPath,
  weightsInputRef,
  weightsStatusLabel,
  weightsUploadSession,
}: ClassifierTrainFormProps) {
  return (
    <form className="generation-form generation-form--stacked classifier-train-layout" onSubmit={onSubmit}>
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
            onChange={onWeightsChange}
            ref={weightsInputRef}
            type="file"
          />
          <button
            className="upload-stage__dropzone classifier-weights__dropzone"
            disabled={submitPending || isUploadingWeights || isCancelling}
            onClick={onWeightsDialogOpen}
            type="button"
          >
            <WeightUploadIllustration />
            <span className="upload-stage__title">
              {weightsUploadSession?.phase === 'uploaded'
                ? 'Веса загружены'
                : weightsUploadSession
                  ? 'Идёт загрузка'
                  : 'Выбрать веса'}
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
                  onClick={onAbortUpload}
                  type="button"
                >
                  ×
                </button>
              </div>
              <div className="upload-stage__progress">
                <div className="upload-stage__progress-bar" style={{ width: `${Math.max(uploadProgress, 8)}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      </label>

      <ClassifierNumericField form={form} label="Train batch size" min={1} name="trainBatchSize" step={1} />
      <ClassifierNumericField form={form} label="Val batch size" min={1} name="valBatchSize" step={1} />
      <ClassifierNumericField form={form} label="Learning rate" min={0.000001} name="learningRate" step={0.000001} />
      <ClassifierNumericField form={form} label="Weight decay" min={0} name="weightDecay" step={0.000001} />
      <ClassifierNumericField
        className="classifier-train-layout__half"
        form={form}
        label="Epochs"
        min={1}
        name="epochs"
        step={1}
      />

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

      <ClassifierSplitSummaryCard
        isLoading={classifierSummaryLoading}
        split={classifierSummary?.split ?? null}
      />
      <ClassifierModelHistory
        onWeightsApply={onWeightsApply}
        selectedWeightsPath={selectedWeightsPath}
        weights={classifierSummary?.uploadedWeights ?? []}
      />

      <div className="classifier-train-layout__actions classifier-train-layout__full">
        <Button disabled={isSubmitDisabled || Boolean(classifierSummary?.split.error)} type="submit">
          Запустить обучение
        </Button>
        {weightsUploadSession ? (
          <Button disabled={submitPending || isUploadingWeights} onClick={onClearWeights} type="button" variant="ghost">
            Сбросить веса
          </Button>
        ) : null}
      </div>
    </form>
  )
}

type NumericFieldName = 'trainBatchSize' | 'valBatchSize' | 'learningRate' | 'weightDecay' | 'epochs'

type ClassifierNumericFieldProps = {
  className?: string
  form: UseFormReturn<ClassifierFormValues>
  label: string
  min: number
  name: NumericFieldName
  step: number
}

function ClassifierNumericField({ className, form, label, min, name, step }: ClassifierNumericFieldProps) {
  return (
    <label className={className ? `generation-form__group ${className}` : 'generation-form__group'}>
      <span className="generation-form__label">{label}</span>
      <input
        className="generation-form__input"
        min={min}
        step={step}
        type="number"
        {...form.register(name, { required: true, min, valueAsNumber: true })}
      />
    </label>
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
