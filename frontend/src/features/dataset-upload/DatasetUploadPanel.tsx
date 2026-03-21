import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { adaptSessionSnapshot } from '@/shared/api/adapters'
import { workflowApi } from '@/shared/api/workflow.api'
import { useDeleteDatasetMutation, useTaskStatusQuery } from '@/shared/api/workflow.hooks'
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { clearActiveUploadSession, createUploadSession, loadActiveUploadSession, type PersistedUploadSession, saveActiveUploadSession } from '@/shared/lib/upload-session-storage'
import { isUploadAbortError, runResumableUpload } from '@/shared/lib/upload-runtime'
import { type DatasetCatalogItem } from '@/shared/types/workflow'
import { useSessionStore } from '@/store/session/session.store'

type DatasetUploadPanelProps = {
  navigateTo?: string
  openOnImportComplete?: boolean
  onProjectChange?: (project: DatasetCatalogItem | null) => void
}

type PendingImportState = {
  sessionId: string
  datasetId: string
  datasetName: string
  jobId: string
}

export function DatasetUploadPanel(props: DatasetUploadPanelProps) {
  const { navigateTo = '/dataset/stats', openOnImportComplete = false, onProjectChange } = props
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadAbortRef = useRef<AbortController | null>(null)
  const activeDatasetId = useSessionStore((state) => state.datasetId)
  const replaceSession = useSessionStore((state) => state.replaceSession)
  const resetSession = useSessionStore((state) => state.reset)
  const [uploadSession, setUploadSession] = useState<PersistedUploadSession | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [isUploading, setIsUploading] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const deleteDatasetMutation = useDeleteDatasetMutation()

  const pendingImport = useMemo<PendingImportState | null>(() => {
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
  }, [uploadSession])

  const importTaskQuery = useTaskStatusQuery(pendingImport?.sessionId ?? null, pendingImport?.jobId ?? null)
  const selectedFileName = uploadSession?.fileName ?? null
  const importProgress = Math.round((importTaskQuery.data?.progress ?? 0) * 100)
  const isImportPending =
    pendingImport !== null &&
    (importTaskQuery.data?.status === 'pending' ||
      importTaskQuery.data?.status === 'running' ||
      importTaskQuery.isLoading)
  const isBusy = isUploading || isImportPending || isCancelling

  const pendingProject = useMemo<DatasetCatalogItem | null>(() => {
    if (pendingImport) {
      return {
        datasetId: pendingImport.datasetId,
        datasetName: pendingImport.datasetName,
        status: 'importing',
        sessionId: pendingImport.sessionId,
        workflowStage: 'upload',
        currentMode: null,
        fineTuneEnabled: false,
        fineTuneResolved: false,
        versionIndex: 1,
        assetCount: 0,
        updatedAt: new Date().toISOString(),
        recentTasks: [
          {
            jobId: pendingImport.jobId,
            taskType: 'import',
            status: importTaskQuery.data?.status ?? 'pending',
            progress: importTaskQuery.data?.progress ?? 0,
            message: importTaskQuery.data?.message ?? 'Идёт импорт датасета',
            errorMessage: importTaskQuery.data?.error?.message ?? null,
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
      fineTuneEnabled: false,
      fineTuneResolved: false,
      versionIndex: 1,
      assetCount: 0,
      updatedAt: new Date().toISOString(),
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
  }, [importTaskQuery.data?.error?.message, importTaskQuery.data?.message, importTaskQuery.data?.progress, importTaskQuery.data?.status, isUploading, pendingImport, uploadProgress, uploadSession])

  useEffect(() => {
    onProjectChange?.(pendingProject)
  }, [onProjectChange, pendingProject])

  useEffect(() => {
    return () => {
      onProjectChange?.(null)
    }
  }, [onProjectChange])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const storedSession = await loadActiveUploadSession()
        if (cancelled || !storedSession) {
          return
        }
        setUploadSession(storedSession)
        if (storedSession.phase === 'uploading' && storedSession.file) {
          await resumeUpload(storedSession)
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
  }, [])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (isUploading) {
          uploadAbortRef.current?.abort('pause')
        }
        return
      }
      if (!isUploading && uploadSession?.phase === 'uploading' && uploadSession.file) {
        void resumeUpload(uploadSession)
      }
    }
    const handleWakeup = () => {
      if (!isUploading && uploadSession?.phase === 'uploading' && uploadSession.file) {
        void resumeUpload(uploadSession)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWakeup)
    window.addEventListener('online', handleWakeup)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWakeup)
      window.removeEventListener('online', handleWakeup)
    }
  }, [isUploading, uploadSession])

  useEffect(() => {
    if (!pendingImport || importTaskQuery.data?.status !== 'success') {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        await clearActiveUploadSession()
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['workflow', 'datasets-catalog'] }),
          queryClient.invalidateQueries({ queryKey: ['workflow', 'jobs'] }),
        ])
        if (openOnImportComplete) {
          const snapshot = await workflowApi.restoreSession(pendingImport.sessionId)
          if (cancelled) {
            return
          }
          replaceSession(adaptSessionSnapshot(snapshot))
          navigate(navigateTo)
        }
        if (!cancelled) {
          setUploadSession(null)
          setUploadProgress(0)
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getErrorMessage(error))
          setUploadSession(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [importTaskQuery.data?.status, navigate, navigateTo, openOnImportComplete, pendingImport, queryClient, replaceSession])

  useEffect(() => {
    if (!pendingImport) {
      return
    }
    if (importTaskQuery.data?.status === 'error' || importTaskQuery.data?.status === 'cancelled') {
      void clearActiveUploadSession()
      setErrorMessage(
        importTaskQuery.data.error?.message ??
          importTaskQuery.data.message ??
          'Импорт датасета завершился с ошибкой.',
      )
      setUploadSession(null)
      setUploadProgress(0)
    }
  }, [importTaskQuery.data, pendingImport])

  useEffect(() => {
    if (!pendingImport || !importTaskQuery.error) {
      return
    }
    void clearActiveUploadSession()
    setErrorMessage(getErrorMessage(importTaskQuery.error))
    setUploadSession(null)
    setUploadProgress(0)
  }, [importTaskQuery.error, pendingImport])

  const openFileDialog = () => {
    if (isBusy) {
      return
    }
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setErrorMessage('Нужен архив формата zip. Другие файлы интерфейс не принимает.')
      event.target.value = ''
      return
    }
    event.target.value = ''
    try {
      const session = createUploadSession(file)
      await saveActiveUploadSession(session)
      setUploadSession(session)
      setUploadProgress(0)
      await resumeUpload(session)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
      setUploadSession(null)
    }
  }

  const handleResetUpload = async () => {
    setIsCancelling(true)
    try {
      if (uploadSession?.phase === 'uploading') {
        uploadAbortRef.current?.abort('cancel')
        if (uploadSession.uploadId) {
          await workflowApi.cancelUpload(uploadSession.uploadId).catch(() => undefined)
        }
        await clearActiveUploadSession()
      }
      if (pendingImport) {
        await workflowApi.cancelTask(pendingImport.sessionId, pendingImport.jobId).catch(() => undefined)
        await deleteDatasetMutation.mutateAsync(pendingImport.datasetId)
        if (activeDatasetId === pendingImport.datasetId) {
          resetSession()
        }
        await clearActiveUploadSession()
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['workflow', 'datasets-catalog'] }),
          queryClient.invalidateQueries({ queryKey: ['workflow', 'jobs'] }),
        ])
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setUploadSession(null)
      setUploadProgress(0)
      setIsCancelling(false)
    }
  }

  const uploadStatusLabel = isUploading
    ? uploadProgress >= 100
      ? 'Архив на сервере, запускаю импорт'
      : `Загрузка архива: ${uploadProgress}%`
    : isImportPending
      ? importTaskQuery.data?.message ?? (importProgress > 0 ? `Импорт датасета: ${importProgress}%` : 'Импортирую датасет')
      : isCancelling
        ? 'Сбрасываю загрузку'
        : uploadSession?.phase === 'uploading'
          ? 'Пауза. Продолжу после возврата во вкладку'
          : 'Ожидание'

  return (
    <>
      <div className="upload-stage">
        <input
          accept=".zip,application/zip"
          className="upload-stage__input"
          disabled={isBusy}
          onChange={(event) => void handleFileSelect(event)}
          ref={fileInputRef}
          type="file"
        />

        <button className="upload-stage__dropzone" disabled={isBusy} onClick={openFileDialog} type="button">
          <UploadIcon />
          <span className="upload-stage__title">{isBusy ? 'Загрузка датасета' : 'Выбрать архив датасета'}</span>
          <span className="upload-stage__hint">
            {isUploading
              ? `Передача файла: ${uploadProgress}%`
              : isImportPending
                ? importTaskQuery.data?.message ?? 'Архив загружен, идёт импорт.'
                : uploadSession?.phase === 'uploading'
                  ? 'Загрузка поставлена на паузу и возобновится автоматически.'
                  : 'Поддерживается один zip-архив.'}
          </span>
        </button>

        {isBusy || uploadSession?.phase === 'uploading' ? (
          <div className="upload-stage__loading">
            <div className="upload-stage__loading-head">
              <Spinner label={uploadStatusLabel} />
              <button
                aria-label="Сбросить загрузку"
                className="upload-stage__abort"
                onClick={() => void handleResetUpload()}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="upload-stage__progress">
              <div
                className="upload-stage__progress-bar"
                style={{
                  width: `${Math.max(isUploading ? uploadProgress : importProgress || uploadProgress, 8)}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="upload-stage__actions">
          <Button disabled={isBusy} onClick={openFileDialog}>
            {isBusy ? 'Идёт обработка' : 'Открыть проводник'}
          </Button>
        </div>

        <div className="info-card">
          <p className="info-card__text">Поддерживается один zip-архив датасета.</p>
          <p className="info-card__text">
            Выбранный файл: <strong>{selectedFileName ?? 'ещё не выбран'}</strong>
          </p>
          <p className="info-card__text">
            Статус: <strong>{uploadStatusLabel}</strong>
          </p>
        </div>
      </div>

      <Modal onClose={() => setErrorMessage(null)} open={Boolean(errorMessage)} title="Ошибка загрузки" tone="error">
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>
    </>
  )

  async function resumeUpload(session: PersistedUploadSession): Promise<void> {
    if (isUploading || session.phase !== 'uploading') {
      return
    }
    if (!session.file) {
      setErrorMessage('Не удалось восстановить файл для продолжения загрузки.')
      return
    }
    const abortController = new AbortController()
    uploadAbortRef.current = abortController
    setIsUploading(true)
    setUploadSession(session)
    try {
      const result = await runResumableUpload({
        session,
        signal: abortController.signal,
        onProgress: setUploadProgress,
      })
      setUploadSession(result.session)
      setUploadProgress(100)
    } catch (error) {
      if (isUploadAbortError(error) || isDomAbortError(error)) {
        if (abortController.signal.reason === 'cancel') {
          setUploadSession(null)
        }
      } else {
        setErrorMessage(getErrorMessage(error))
      }
    } finally {
      uploadAbortRef.current = null
      setIsUploading(false)
      const storedSession = await loadActiveUploadSession()
      setUploadSession(storedSession)
    }
  }
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" className="upload-stage__icon" viewBox="0 0 120 120">
      <path d="M60 12C33.49 12 12 33.49 12 60s21.49 48 48 48 48-21.49 48-48S86.51 12 60 12Z" fill="#eef5ff" />
      <path
        d="M60 28v38m0-38 16 16M60 28 44 44M36 76h48"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="8"
      />
    </svg>
  )
}

function isDomAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
