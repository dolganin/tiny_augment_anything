import axios from 'axios'
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { adaptSessionSnapshot } from '@/shared/api/adapters'
import { workflowApi } from '@/shared/api/workflow.api'
import { useDeleteDatasetMutation, useTaskStatusQuery, useUploadDatasetMutation } from '@/shared/api/workflow.hooks'
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { getErrorMessage } from '@/shared/lib/get-error-message'
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
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [pendingImport, setPendingImport] = useState<PendingImportState | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const uploadMutation = useUploadDatasetMutation()
  const deleteDatasetMutation = useDeleteDatasetMutation()
  const importTaskQuery = useTaskStatusQuery(pendingImport?.sessionId ?? null, pendingImport?.jobId ?? null)

  const importProgress = Math.round((importTaskQuery.data?.progress ?? 0) * 100)
  const isImportPending =
    pendingImport !== null &&
    (importTaskQuery.data?.status === 'pending' ||
      importTaskQuery.data?.status === 'running' ||
      importTaskQuery.isLoading)
  const isBusy = uploadMutation.isPending || isImportPending || isCancelling
  const baseDatasetName = pendingImport?.datasetName ?? selectedFileName?.replace(/\.zip$/i, '') ?? 'Новый датасет'

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
    if (!uploadMutation.isPending || !selectedFileName) {
      return null
    }
    return {
      datasetId: `pending-${selectedFileName}`,
      datasetName: baseDatasetName,
      status: 'uploading',
      sessionId: `pending-${selectedFileName}`,
      workflowStage: 'upload',
      currentMode: null,
      fineTuneEnabled: false,
      fineTuneResolved: false,
      versionIndex: 1,
      assetCount: 0,
      updatedAt: new Date().toISOString(),
      recentTasks: [
        {
          jobId: `pending-${selectedFileName}`,
          taskType: 'upload',
          status: 'running',
          progress: uploadProgress / 100,
          message: uploadProgress >= 100 ? 'Архив на сервере, запускаю импорт' : `Передача архива ${uploadProgress}%`,
          errorMessage: null,
        },
      ],
      isPendingLocal: true,
    }
  }, [baseDatasetName, importTaskQuery.data?.error?.message, importTaskQuery.data?.message, importTaskQuery.data?.progress, importTaskQuery.data?.status, pendingImport, selectedFileName, uploadMutation.isPending, uploadProgress])

  useEffect(() => {
    onProjectChange?.(pendingProject)
  }, [onProjectChange, pendingProject])

  useEffect(() => {
    return () => {
      onProjectChange?.(null)
    }
  }, [onProjectChange])

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
    const abortController = new AbortController()
    let importStarted = false
    uploadAbortRef.current = abortController
    setSelectedFileName(file.name)
    setUploadProgress(0)
    setPendingImport(null)
    try {
      const response = await uploadMutation.mutateAsync({
        file,
        signal: abortController.signal,
        onProgress: (progress) => {
          setUploadProgress(progress)
        },
      })
      if (response.error?.message) {
        setErrorMessage(response.error.message)
        return
      }
      setPendingImport({
        sessionId: response.sessionId,
        datasetId: response.datasetId,
        datasetName: response.datasetName ?? file.name.replace(/\.zip$/i, ''),
        jobId: response.jobId,
      })
      importStarted = true
    } catch (error) {
      if (!isAbortError(error)) {
        setErrorMessage(getErrorMessage(error))
      }
      setSelectedFileName(null)
    } finally {
      uploadAbortRef.current = null
      event.target.value = ''
      if (!importStarted) {
        setUploadProgress(0)
      }
    }
  }

  const handleResetUpload = async () => {
    setIsCancelling(true)
    try {
      if (uploadMutation.isPending) {
        uploadAbortRef.current?.abort()
      }
      if (pendingImport) {
        await deleteDatasetMutation.mutateAsync(pendingImport.datasetId)
        if (activeDatasetId === pendingImport.datasetId) {
          resetSession()
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['workflow', 'datasets-catalog'] }),
          queryClient.invalidateQueries({ queryKey: ['workflow', 'jobs'] }),
        ])
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setPendingImport(null)
      setSelectedFileName(null)
      setUploadProgress(0)
      setIsCancelling(false)
    }
  }

  useEffect(() => {
    if (!pendingImport || importTaskQuery.data?.status !== 'success') {
      return
    }
    let cancelled = false
    void (async () => {
      try {
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
          setPendingImport(null)
          setSelectedFileName(null)
          setUploadProgress(0)
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getErrorMessage(error))
          setPendingImport(null)
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
      setErrorMessage(
        importTaskQuery.data.error?.message ??
          importTaskQuery.data.message ??
          'Импорт датасета завершился с ошибкой.',
      )
      setPendingImport(null)
      setSelectedFileName(null)
      setUploadProgress(0)
    }
  }, [importTaskQuery.data, pendingImport])

  useEffect(() => {
    if (!pendingImport || !importTaskQuery.error) {
      return
    }
    setErrorMessage(getErrorMessage(importTaskQuery.error))
    setPendingImport(null)
    setSelectedFileName(null)
    setUploadProgress(0)
  }, [importTaskQuery.error, pendingImport])

  const uploadStatusLabel = uploadMutation.isPending
    ? uploadProgress >= 100
      ? 'Архив на сервере, запускаю импорт'
      : `Загрузка архива: ${uploadProgress}%`
    : isImportPending
      ? importTaskQuery.data?.message ?? (importProgress > 0 ? `Импорт датасета: ${importProgress}%` : 'Импортирую датасет')
      : isCancelling
        ? 'Сбрасываю загрузку'
        : 'Ожидание'

  return (
    <>
      <div className="upload-stage">
        <input
          accept=".zip,application/zip"
          className="upload-stage__input"
          disabled={isBusy}
          onChange={handleFileSelect}
          ref={fileInputRef}
          type="file"
        />

        <button className="upload-stage__dropzone" disabled={isBusy} onClick={openFileDialog} type="button">
          <UploadIcon />
          <span className="upload-stage__title">{isBusy ? 'Загрузка датасета' : 'Выбрать архив датасета'}</span>
          <span className="upload-stage__hint">
            {uploadMutation.isPending
              ? uploadProgress >= 100
                ? 'Архив уже передан, начинается импорт.'
                : `Передача файла: ${uploadProgress}%`
              : isImportPending
                ? importTaskQuery.data?.message ?? 'Архив загружен, идёт импорт.'
                : 'Поддерживается один zip-архив.'}
          </span>
        </button>

        {isBusy ? (
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
                  width: `${Math.max(uploadMutation.isPending ? uploadProgress : importProgress, 8)}%`,
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

function isAbortError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.code === 'ERR_CANCELED'
}
