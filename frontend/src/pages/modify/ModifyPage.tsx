import { useForm } from 'react-hook-form'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { Modal } from '@/shared/ui/feedback/Modal'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { TrainingLogPanel } from '@/features/fine-tune-training/TrainingLogPanel'
import { DiffusionLoraPanel } from '@/features/diffusion-lora/DiffusionLoraPanel'
import { ReviewWorkspace } from '@/features/generation-review/ReviewWorkspace'
import { Button } from '@/shared/ui/buttons/Button'
import { ModificationModal } from '@/features/modification/ModificationModal'
import { type ModifyFormValues } from '@/pages/modify/modify.types'
import { useModifyPage } from '@/pages/modify/useModifyPage'
import { useSessionStore } from '@/store/session/session.store'
import '@/features/generation-config/generation-config.css'

export function ModifyPage() {
  const sessionId = useSessionStore((state) => state.sessionId)
  const form = useForm<ModifyFormValues>({
    defaultValues: {
      prompt: '',
    },
  })
  const {
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
    negativePromptValue,
    priorityFields,
    reviewPendingCount,
    saveReviewToDataset,
    samPromptValue,
    selectedSourceCount,
    selectedSourceIds,
    secondaryFields,
    setApplyMaskToAll,
    setApplyPromptToAll,
    setAreaConfirmed,
    setErrorMessage,
    setIsModificationModalOpen,
    setModificationMode,
    setSession,
    source,
    sourceIndex,
    sourceItems,
    sourceQuery,
    submitForm,
    totalTargetCount,
    toggleSourceSelection,
    updateAreaPoints,
    updateFieldValue,
    updatePromptValue,
  } = useModifyPage({ form })

  return (
    <>
      <PageFrame
        title="Модификация"
      >
        <section className="info-card">
          <p className="info-card__text">
            Редактор модификации теперь открывается как отдельное модальное окно без прокрутки по странице.
          </p>
          <p className="info-card__text">
            После запуска задачи окно можно закрыть и следить за логами, не теряя текущий workflow.
          </p>
          <div className="modify-panel__actions">
            <Button
              disabled={configQuery.isLoading || sourceQuery.isLoading || !source}
              onClick={() => setIsModificationModalOpen(true)}
              type="button"
            >
              Открыть редактор модификации
            </Button>
            {reviewPendingCount > 0 ? (
              <Button onClick={() => setSession({ workflowStage: 'review' })} type="button" variant="secondary">
                Открыть отбор ({reviewPendingCount})
              </Button>
            ) : null}
          </div>
        </section>

        <DiffusionLoraPanel
          onError={(message) => setErrorMessage(message)}
          onSelectAdapter={(adapterPath) => updateFieldValue('lora_path', adapterPath)}
          selectedAdapterPath={fieldValues.lora_path ?? ''}
          sessionId={sessionId}
        />

        {(configQuery.isLoading || sourceQuery.isLoading) && (
          <div className="upload-stage__loading">
            <Spinner label="Подтягиваю изображение и параметры модификации." />
          </div>
        )}

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

      <ModificationModal
        applyMaskToAll={applyMaskToAll}
        applyPromptToAll={applyPromptToAll}
        areaConfirmed={areaConfirmed}
        areaPoints={areaPoints}
        fieldValues={fieldValues}
        form={form}
        mode={modificationMode}
        negativePromptValue={negativePromptValue}
        onApplyMaskToAllChange={setApplyMaskToAll}
        onApplyPromptToAllChange={setApplyPromptToAll}
        onAreaConfirm={setAreaConfirmed}
        onAreaPointsChange={updateAreaPoints}
        onClose={() => setIsModificationModalOpen(false)}
        onFieldValueChange={updateFieldValue}
        onModeChange={setModificationMode}
        onOpenReview={() => setSession({ workflowStage: 'review' })}
        onPolygonClear={() => updateAreaPoints([])}
        onPolygonUndo={() => updateAreaPoints(areaPoints.slice(0, -1))}
        onPromptChange={updatePromptValue}
        onSamPromptChange={(value) => updateFieldValue('sam_prompt', value)}
        onSourceMove={moveSource}
        onSubmit={submitForm}
        onNegativePromptChange={(value) => updateFieldValue('negative_prompt', value)}
        onToggleSourceSelection={toggleSourceSelection}
        open={!configQuery.isLoading && !sourceQuery.isLoading && isModificationModalOpen}
        priorityFields={priorityFields}
        reviewPendingCount={reviewPendingCount}
        samPromptValue={samPromptValue}
        selectedSourceCount={selectedSourceCount}
        selectedSourceIds={selectedSourceIds}
        secondaryFields={secondaryFields}
        source={source}
        sourceIndex={sourceIndex}
        sourceItems={sourceItems}
        startPending={isModificationActive}
        totalTargetCount={totalTargetCount}
      />

      <ReviewWorkspace
        onClose={() => void closeReview()}
        onSaveToDataset={() => void saveReviewToDataset()}
        onStartClassifier={() => void moveToClassifier()}
        open={isReviewOpen}
      />
    </>
  )
}
