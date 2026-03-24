import { type PersistedUploadSession } from '@/shared/lib/upload-session-storage'
import { type DatasetCatalogItem } from '@/shared/types/workflow'
import { type PendingImportState } from './dataset-upload.types'

type BuildPendingProjectArgs = {
  importMessage?: string | null
  importProgress?: number
  importStatus?: string
  importErrorMessage?: string | null
  isUploading: boolean
  pendingImport: PendingImportState | null
  uploadProgress: number
  uploadSession: PersistedUploadSession | null
}

type UploadStatusLabelArgs = {
  importMessage?: string | null
  importProgress: number
  isCancelling: boolean
  isImportPending: boolean
  isUploading: boolean
  uploadProgress: number
  uploadSession: PersistedUploadSession | null
}

export function buildPendingImportState(uploadSession: PersistedUploadSession | null): PendingImportState | null {
  if (
    uploadSession?.phase !== 'importing' ||
    !uploadSession.sessionId ||
    !uploadSession.datasetId ||
    !uploadSession.jobId
  ) {
    return null
  }

  return {
    sessionId: uploadSession.sessionId,
    datasetId: uploadSession.datasetId,
    datasetName: uploadSession.datasetName ?? uploadSession.fileName.replace(/\.zip$/i, ''),
    jobId: uploadSession.jobId,
  }
}

export function buildPendingProject(args: BuildPendingProjectArgs): DatasetCatalogItem | null {
  const {
    importErrorMessage,
    importMessage,
    importProgress = 0,
    importStatus,
    isUploading,
    pendingImport,
    uploadProgress,
    uploadSession,
  } = args

  if (pendingImport) {
    return {
      datasetId: pendingImport.datasetId,
      datasetName: pendingImport.datasetName,
      status: 'importing',
      sessionId: pendingImport.sessionId,
      workflowStage: 'upload',
      currentMode: null,
      versionIndex: 1,
      assetCount: 0,
      updatedAt: new Date().toISOString(),
      previewUrls: [],
      recentTasks: [
        {
          jobId: pendingImport.jobId,
          taskType: 'import',
          status: importStatus ?? 'pending',
          progress: importProgress,
          message: importMessage ?? 'Идёт импорт датасета',
          errorMessage: importErrorMessage ?? null,
        },
      ],
      isPendingLocal: true,
    }
  }

  if (uploadSession?.phase !== 'uploading') {
    return null
  }

  return {
    datasetId: uploadSession.uploadId ? `pending-${uploadSession.uploadId}` : `pending-${uploadSession.fileName}`,
    datasetName: uploadSession.fileName.replace(/\.zip$/i, ''),
    status: 'uploading',
    sessionId: uploadSession.uploadId ? `pending-${uploadSession.uploadId}` : `pending-${uploadSession.fileName}`,
    workflowStage: 'upload',
    currentMode: null,
    versionIndex: 1,
    assetCount: 0,
    updatedAt: new Date().toISOString(),
    previewUrls: [],
    recentTasks: [
      {
        jobId: uploadSession.uploadId ?? `pending-${uploadSession.fileName}`,
        taskType: 'upload',
        status: isUploading ? 'running' : 'pending',
        progress: uploadProgress / 100,
        message: isUploading ? `Передача архива ${uploadProgress}%` : 'Ожидает возобновления',
        errorMessage: null,
      },
    ],
    isPendingLocal: true,
  }
}

export function buildUploadStatusLabel(args: UploadStatusLabelArgs): string {
  const { importMessage, importProgress, isCancelling, isImportPending, isUploading, uploadProgress, uploadSession } = args

  if (isUploading) {
    return uploadProgress >= 100 ? 'Архив на сервере, запускаю импорт' : `Загрузка архива: ${uploadProgress}%`
  }

  if (isImportPending) {
    return importMessage ?? (importProgress > 0 ? `Импорт датасета: ${importProgress}%` : 'Импортирую датасет')
  }

  if (isCancelling) {
    return 'Сбрасываю загрузку'
  }

  if (uploadSession?.phase === 'uploading') {
    return 'Пауза. Продолжу после возврата во вкладку'
  }

  return 'Ожидание'
}

export function shouldShowCompactMeta(args: {
  isBusy: boolean
  pendingImport: PendingImportState | null
  selectedFileName: string | null
  uploadSession: PersistedUploadSession | null
}): boolean {
  const { isBusy, pendingImport, selectedFileName, uploadSession } = args
  return Boolean(selectedFileName) || isBusy || uploadSession?.phase === 'uploading' || Boolean(pendingImport)
}

export function isDomAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
