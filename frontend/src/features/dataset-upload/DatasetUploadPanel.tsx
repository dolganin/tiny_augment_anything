import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { adaptSessionSnapshot } from '@/shared/api/adapters'
import { workflowApi } from '@/shared/api/workflow.api'
import { useTaskStatusQuery, useUploadDatasetMutation } from '@/shared/api/workflow.hooks'
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { useSessionStore } from '@/store/session/session.store'

type DatasetUploadPanelProps = {
  navigateTo?: string
}

type PendingImportState = {
  sessionId: string
  datasetId: string
  datasetName: string
  jobId: string
}

export function DatasetUploadPanel({ navigateTo = '/dataset/stats' }: DatasetUploadPanelProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const replaceSession = useSessionStore((state) => state.replaceSession)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [pendingImport, setPendingImport] = useState<PendingImportState | null>(null)
  const uploadMutation = useUploadDatasetMutation()
  const importTaskQuery = useTaskStatusQuery(pendingImport?.sessionId ?? null, pendingImport?.jobId ?? null)

  const openFileDialog = () => {
    if (uploadMutation.isPending || pendingImport) {
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
      setErrorMessage('Нужен архив формата .zip. Другие файлы интерфейс не принимает.')
      event.target.value = ''
      return
    }

    setSelectedFileName(file.name)
    setUploadProgress(0)

    try {
      const response = await uploadMutation.mutateAsync({
        file,
        onProgress: (progress) => {
          setUploadProgress(progress)
        },
      })

      if (response.error?.message) {
        setErrorMessage(response.error.message)
        return
      }

      replaceSession({
        sessionId: response.sessionId,
        datasetId: response.datasetId,
        datasetName: response.datasetName ?? file.name.replace(/\.zip$/i, ''),
        workflowStage: 'upload',
        fineTuneResolved: false,
        currentMode: null,
        selectedClasses: [],
      })
      setPendingImport({
        sessionId: response.sessionId,
        datasetId: response.datasetId,
        datasetName: response.datasetName ?? file.name.replace(/\.zip$/i, ''),
        jobId: response.jobId,
      })
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      event.target.value = ''
      setUploadProgress(0)
    }
  }

  useEffect(() => {
    if (!pendingImport || importTaskQuery.data?.status !== 'success') {
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const snapshot = await workflowApi.restoreSession(pendingImport.sessionId)
        if (cancelled) {
          return
        }
        replaceSession(adaptSessionSnapshot(snapshot))
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['workflow', 'datasets-catalog'] }),
          queryClient.invalidateQueries({ queryKey: ['workflow', 'jobs'] }),
        ])
        setPendingImport(null)
        navigate(navigateTo)
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
  }, [importTaskQuery.data?.status, navigate, navigateTo, pendingImport, queryClient, replaceSession])

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
    }
  }, [importTaskQuery.data, pendingImport])

  useEffect(() => {
    if (!pendingImport || !importTaskQuery.error) {
      return
    }

    setErrorMessage(getErrorMessage(importTaskQuery.error))
    setPendingImport(null)
  }, [importTaskQuery.error, pendingImport])

  const isImportPending =
    pendingImport !== null &&
    (importTaskQuery.data?.status === 'pending' ||
      importTaskQuery.data?.status === 'running' ||
      importTaskQuery.isLoading)
  const importProgress = Math.round((importTaskQuery.data?.progress ?? 0) * 100)
  const isBusy = uploadMutation.isPending || isImportPending

  const uploadStatusLabel = uploadMutation.isPending
    ? uploadProgress >= 100
      ? 'Архив загружен, импортирую датасет'
      : `Загрузка архива: ${uploadProgress}%`
    : isImportPending
      ? importTaskQuery.data?.message ?? (importProgress > 0 ? `Импорт датасета: ${importProgress}%` : 'Импортирую датасет')
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

        <button
          className="upload-stage__dropzone"
          disabled={isBusy}
          onClick={openFileDialog}
          type="button"
        >
          <UploadIcon />
          <span className="upload-stage__title">
            {isBusy ? 'Загрузка датасета' : 'Выбрать архив датасета'}
          </span>
          <span className="upload-stage__hint">
            {uploadMutation.isPending
              ? uploadProgress >= 100
                ? 'Архив уже на сервере, идёт импорт.'
                : `Передача файла: ${uploadProgress}%`
              : isImportPending
                ? importTaskQuery.data?.message ?? 'Архив уже загружен, идёт импорт.'
              : 'Только `.zip`.'}
          </span>
        </button>

        {isBusy ? (
          <div className="upload-stage__loading">
            <Spinner label={uploadStatusLabel} />
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
          <p className="info-card__text">
            Поддерживается один `.zip`-архив датасета.
          </p>
          <p className="info-card__text">
            Выбранный файл: <strong>{selectedFileName ?? 'ещё не выбран'}</strong>
          </p>
          <p className="info-card__text">
            Статус: <strong>{uploadStatusLabel}</strong>
          </p>
        </div>
      </div>

      <Modal
        onClose={() => setErrorMessage(null)}
        open={Boolean(errorMessage)}
        title="Ошибка загрузки"
        tone="error"
      >
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>
    </>
  )
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" className="upload-stage__icon" viewBox="0 0 120 120">
      <path
        d="M60 12C33.49 12 12 33.49 12 60s21.49 48 48 48 48-21.49 48-48S86.51 12 60 12Z"
        fill="#eef5ff"
      />
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
