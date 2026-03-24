import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { DatasetUploadDropzone } from './DatasetUploadDropzone'
import { DatasetUploadMeta } from './DatasetUploadMeta'
import { DatasetUploadStatus } from './DatasetUploadStatus'
import { type DatasetUploadPanelProps } from './dataset-upload.types'
import { useDatasetUploadPanel } from './useDatasetUploadPanel'

export function DatasetUploadPanel(props: DatasetUploadPanelProps) {
  const { compact = false } = props
  const {
    errorMessage,
    fileInputRef,
    handleFileSelect,
    handleResetUpload,
    importMessage,
    importProgress,
    isBusy,
    isImportPending,
    isUploading,
    openFileDialog,
    selectedFileName,
    setErrorMessage,
    showCompactMeta,
    uploadProgress,
    uploadSession,
    uploadStatusLabel,
  } = useDatasetUploadPanel(props)
  const dropzoneTitle = isBusy ? 'Загрузка датасета' : compact ? 'Загрузить архив' : 'Выбрать архив датасета'
  const dropzoneHint = isUploading
    ? `Передача файла: ${uploadProgress}%`
    : isImportPending
      ? importMessage ?? 'Архив загружен, идёт импорт.'
      : uploadSession?.phase === 'uploading'
        ? 'Загрузка поставлена на паузу и возобновится автоматически.'
        : 'Поддерживается один zip-архив.'

  return (
    <>
      <div className={compact ? 'upload-stage upload-stage--compact' : 'upload-stage'}>
        <DatasetUploadDropzone
          disabled={isBusy}
          fileInputRef={fileInputRef}
          hint={dropzoneHint}
          onFileChange={(event) => void handleFileSelect(event)}
          onOpenFileDialog={openFileDialog}
          title={dropzoneTitle}
        />

        {isBusy || uploadSession?.phase === 'uploading' ? (
          <DatasetUploadStatus
            importProgress={importProgress}
            isUploading={isUploading}
            onReset={() => void handleResetUpload()}
            uploadProgress={uploadProgress}
            uploadStatusLabel={uploadStatusLabel}
          />
        ) : null}

        {!compact ? (
          <div className="upload-stage__actions">
            <Button disabled={isBusy} onClick={openFileDialog}>
              {isBusy ? 'Идёт обработка' : 'Открыть проводник'}
            </Button>
          </div>
        ) : null}

        <DatasetUploadMeta
          compact={compact}
          isBusy={isBusy}
          isImportPending={isImportPending}
          selectedFileName={selectedFileName}
          showCompactMeta={showCompactMeta}
          uploadPhase={uploadSession?.phase}
          uploadStatusLabel={uploadStatusLabel}
        />
      </div>

      <Modal onClose={() => setErrorMessage(null)} open={Boolean(errorMessage)} title="Ошибка загрузки" tone="error">
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>
    </>
  )
}
