import { useForm } from 'react-hook-form'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { Modal } from '@/shared/ui/feedback/Modal'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { TrainingLogPanel } from '@/features/fine-tune-training/TrainingLogPanel'
import { ReviewWorkspace } from '@/features/generation-review/ReviewWorkspace'
import { ModifyWorkbench } from '@/pages/modify/ModifyWorkbench'
import { type ModifyFormValues } from '@/pages/modify/modify.types'
import { useModifyPage } from '@/pages/modify/useModifyPage'
import '@/features/generation-config/generation-config.css'

export function ModifyPage() {
  const form = useForm<ModifyFormValues>({
    defaultValues: {
      prompt: '',
    },
  })
  const {
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
    negativePromptValue,
    priorityFields,
    reviewPendingCount,
    samPromptValue,
    secondaryFields,
    setAreaConfirmed,
    setErrorMessage,
    setSession,
    source,
    sourceIndex,
    sourceItems,
    sourceQuery,
    submitForm,
    totalTargetCount,
    updateAreaPoints,
    updateFieldValue,
  } = useModifyPage({ form })

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
          <ModifyWorkbench
            areaConfirmed={areaConfirmed}
            areaPoints={areaPoints}
            fieldValues={fieldValues}
            form={form}
            negativePromptValue={negativePromptValue}
            onAreaConfirm={() => setAreaConfirmed(true)}
            onAreaPointsChange={updateAreaPoints}
            onFieldValueChange={updateFieldValue}
            onOpenReview={() => setSession({ workflowStage: 'review' })}
            onPolygonClear={() => updateAreaPoints([])}
            onPolygonUndo={() => updateAreaPoints(areaPoints.slice(0, -1))}
            onSourceMove={moveSource}
            onSubmit={submitForm}
            priorityFields={priorityFields}
            reviewPendingCount={reviewPendingCount}
            samPromptValue={samPromptValue}
            secondaryFields={secondaryFields}
            source={source}
            sourceIndex={sourceIndex}
            sourceItems={sourceItems}
            startPending={isModificationActive}
            totalTargetCount={totalTargetCount}
          />
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
