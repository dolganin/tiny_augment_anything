import { useForm } from 'react-hook-form'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { Modal } from '@/shared/ui/feedback/Modal'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { TrainingLogPanel } from '@/features/fine-tune-training/TrainingLogPanel'
import { DiffusionLoraPanel } from '@/features/diffusion-lora/DiffusionLoraPanel'
import { ReviewWorkspace } from '@/features/generation-review/ReviewWorkspace'
import { Button } from '@/shared/ui/buttons/Button'
import { ModificationModal } from '@/features/modification/ModificationModal'
import { BatchProgressPanel } from '@/pages/modify/BatchProgressPanel'
import { BatchSourceSelector } from '@/pages/modify/BatchSourceSelector'
import { BatchTemplateSetup } from '@/pages/modify/BatchTemplateSetup'
import { BatchValidationModal } from '@/pages/modify/BatchValidationModal'
import { type ModifyFormValues } from '@/pages/modify/modify.types'
import { useModifyPage } from '@/pages/modify/useModifyPage'
import { useSessionStore } from '@/store/session/session.store'
import '@/features/generation-config/generation-config.css'
import '@/features/modification/modification-modal.css'
import { useMemo } from 'react'

export function ModifyPage() {
  const sessionId = useSessionStore((state) => state.sessionId)
  const form = useForm<ModifyFormValues>({
    defaultValues: {
      prompt: '',
    },
  })
  const {
    applyPromptToAll,
    applyPromptTemplate,
    areaConfirmed,
    areaPoints,
    batchMaskPreviewPoints,
    batchStep,
    closeReview,
    clearSourceSelection,
    configQuery,
    createDatasetPolygonTemplate,
    errorMessage,
    fieldValues,
    focusSource,
    isBatchValidationModalOpen,
    isModificationActive,
    isModificationModalOpen,
    isReviewOpen,
    launchMode,
    logs,
    modificationMode,
    moveSource,
    moveToClassifier,
    negativePromptValue,
    priorityFields,
    reviewPendingCount,
    saveReviewToDataset,
    savePromptTemplate,
    selectAllSources,
    samPromptValue,
    selectionPromptTemplates,
    selectedSourceCount,
    selectedSourceIds,
    selectedSourceItems,
    secondaryFields,
    deletePromptTemplate,
    setApplyPromptToAll,
    setAreaConfirmed,
    setBatchMaskPreviewPoints,
    setBatchStep,
    setErrorMessage,
    setIsBatchValidationModalOpen,
    setIsModificationModalOpen,
    setLaunchMode,
    setModificationMode,
    setSession,
    source,
    sourceIndex,
    sourceItems,
    sourceQuery,
    submitBatchModification,
    submitForm,
    totalTargetCount,
    textPromptTemplates,
    toggleSourceSelection,
    updateAreaPoints,
    updateFieldValue,
    updatePromptValue,
  } = useModifyPage({ form })

  const sourceLabelById = useMemo(
    () =>
      Object.fromEntries(
        sourceItems.map((item, index) => [item.assetId, `${item.className} #${index + 1}`]),
      ),
    [sourceItems],
  )

  return (
    <>
      <PageFrame
        title="Модификация"
      >
        <section className="info-card">
          <div className="modify-launch-toggle" role="tablist" aria-label="Режим запуска модификации">
            <button
              aria-selected={launchMode === 'single'}
              className={`modify-launch-toggle__option${launchMode === 'single' ? ' modify-launch-toggle__option--active' : ''}`}
              onClick={() => setLaunchMode('single')}
              role="tab"
              type="button"
            >
              <strong>Картиночная</strong>
              <span>Одна текущая картинка</span>
            </button>
            <button
              aria-selected={launchMode === 'batch'}
              className={`modify-launch-toggle__option${launchMode === 'batch' ? ' modify-launch-toggle__option--active' : ''}`}
              onClick={() => setLaunchMode('batch')}
              role="tab"
              type="button"
            >
              <strong>Батчевая</strong>
              <span>Несколько источников за запуск</span>
            </button>
          </div>
          <p className="info-card__text">
            {launchMode === 'batch'
              ? 'Пакетный режим ведёт через общий шаблон: промпт и маска, затем выбор источников и финальная валидация.'
              : 'Картиночный режим запускает модификацию только для текущего изображения, без мультивыбора источников.'}
          </p>
          <p className="info-card__text">
            После запуска задачи окно можно закрыть и следить за логами, не теряя текущий workflow.
          </p>
          <div className="modify-panel__actions">
            {launchMode === 'single' ? (
              <Button
                disabled={configQuery.isLoading || sourceQuery.isLoading || !source}
                onClick={() => setIsModificationModalOpen(true)}
                type="button"
              >
                Открыть редактор изображения
              </Button>
            ) : null}
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

        {launchMode === 'batch' ? (
          <>
            <BatchTemplateSetup
              areaConfirmed={areaConfirmed}
              areaPoints={areaPoints}
              currentSource={source}
              negativePromptValue={negativePromptValue}
              onAreaConfirm={setAreaConfirmed}
              onAreaPointsChange={updateAreaPoints}
              onContinue={() => setBatchStep('select-sources')}
              onNegativePromptChange={(value) => updateFieldValue('negative_prompt', value)}
              onPolygonClear={() => updateAreaPoints([])}
              onPolygonUndo={() => updateAreaPoints(areaPoints.slice(0, -1))}
              onPreviewMaskChange={setBatchMaskPreviewPoints}
              onPromptChange={updatePromptValue}
              onSaveTextTemplate={() => savePromptTemplate('text')}
              promptValue={form.watch('prompt')}
            />

            {batchStep === 'select-sources' ? (
              <BatchSourceSelector
                currentSourceId={source?.assetId ?? null}
                onClearSelection={clearSourceSelection}
                onFocusSource={focusSource}
                onSelectAll={selectAllSources}
                onToggleSourceSelection={toggleSourceSelection}
                onValidate={() => setIsBatchValidationModalOpen(true)}
                selectedSourceCount={selectedSourceCount}
                selectedSourceIds={selectedSourceIds}
                sourceItems={sourceItems}
                templateMask={batchMaskPreviewPoints}
              />
            ) : null}
          </>
        ) : null}

        {(configQuery.isLoading || sourceQuery.isLoading) && (
          <div className="upload-stage__loading">
            <Spinner label="Подтягиваю изображение и параметры модификации." />
          </div>
        )}

        {isModificationActive && !errorMessage ? (
          <div className="upload-stage__loading">
            <Spinner
              label="Модификация выполняется. После завершения результаты появятся на этапе отбора."
              tone="diffusion"
            />
          </div>
        ) : null}

        <TrainingLogPanel
          emptyLabel="Логи модификации появятся после запуска задачи."
          logs={logs}
          title="Поток логов модификации"
        />

        {launchMode === 'batch' ? (
          <BatchProgressPanel sessionId={sessionId} sourceLabelById={sourceLabelById} />
        ) : null}
      </PageFrame>

      <Modal
        onClose={() => setErrorMessage(null)}
        open={Boolean(errorMessage)}
        title="Ошибка модификации"
        tone="error"
      >
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>

      <BatchValidationModal
        fieldValues={fieldValues}
        negativePromptValue={negativePromptValue}
        onClose={() => setIsBatchValidationModalOpen(false)}
        onFieldValueChange={updateFieldValue}
        onSubmit={(mode) => void submitBatchModification(mode)}
        open={launchMode === 'batch' && isBatchValidationModalOpen}
        previewMask={batchMaskPreviewPoints}
        priorityFields={priorityFields}
        promptValue={form.watch('prompt')}
        secondaryFields={secondaryFields}
        selectedSources={selectedSourceItems}
        startPending={isModificationActive}
      />

      <ModificationModal
        applyPromptToAll={applyPromptToAll}
        areaConfirmed={areaConfirmed}
        areaPoints={areaPoints}
        fieldValues={fieldValues}
        form={form}
        launchMode={launchMode}
        mode={modificationMode}
        negativePromptValue={negativePromptValue}
        onApplyTemplate={applyPromptTemplate}
        onApplyPromptToAllChange={setApplyPromptToAll}
        onAreaConfirm={setAreaConfirmed}
        onAreaPointsChange={updateAreaPoints}
        onClose={() => setIsModificationModalOpen(false)}
        onDeleteTemplate={deletePromptTemplate}
        onFieldValueChange={updateFieldValue}
        onModeChange={setModificationMode}
        onOpenReview={() => setSession({ workflowStage: 'review' })}
        onPolygonClear={() => updateAreaPoints([])}
        onPolygonUndo={() => updateAreaPoints(areaPoints.slice(0, -1))}
        onPromptChange={updatePromptValue}
        onSamPromptChange={(value) => updateFieldValue('sam_prompt', value)}
        onSaveTemplate={savePromptTemplate}
        onSavePolygonTemplate={() => {
          const name = window.prompt('Название шаблона полигона')
          if (name?.trim()) {
            createDatasetPolygonTemplate(name)
          }
        }}
        onSourceMove={moveSource}
        onSubmit={submitForm}
        onNegativePromptChange={(value) => updateFieldValue('negative_prompt', value)}
        onToggleSourceSelection={toggleSourceSelection}
        open={launchMode === 'single' && !configQuery.isLoading && !sourceQuery.isLoading && isModificationModalOpen}
        priorityFields={priorityFields}
        reviewPendingCount={reviewPendingCount}
        samPromptValue={samPromptValue}
        selectionTemplates={selectionPromptTemplates}
        selectedSourceCount={selectedSourceCount}
        selectedSourceIds={selectedSourceIds}
        secondaryFields={secondaryFields}
        source={source}
        sourceIndex={sourceIndex}
        sourceItems={sourceItems}
        startPending={isModificationActive}
        submitLabel="Запустить модификацию"
        textTemplates={textPromptTemplates}
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
