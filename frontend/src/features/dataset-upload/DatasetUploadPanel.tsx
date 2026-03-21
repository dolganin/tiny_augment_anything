import { ChangeEvent, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useUploadDatasetMutation } from '@/shared/api/workflow.hooks'
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { useSessionStore } from '@/store/session/session.store'

type DatasetUploadPanelProps = {
  navigateTo?: string
}

export function DatasetUploadPanel({ navigateTo = '/dataset/stats' }: DatasetUploadPanelProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const replaceSession = useSessionStore((state) => state.replaceSession)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const uploadMutation = useUploadDatasetMutation()

  const openFileDialog = () => {
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

    try {
      const response = await uploadMutation.mutateAsync(file)

      if (response.error?.message) {
        setErrorMessage(response.error.message)
        return
      }

      replaceSession({
        sessionId: response.sessionId,
        datasetId: response.datasetId,
        datasetName: response.datasetName ?? file.name.replace(/\.zip$/i, ''),
        workflowStage: 'dataset-stats',
        fineTuneResolved: false,
        currentMode: null,
        selectedClasses: [],
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workflow', 'datasets-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['workflow', 'jobs'] }),
      ])
      navigate(navigateTo)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      event.target.value = ''
    }
  }

  return (
    <>
      <div className="upload-stage">
        <input
          accept=".zip,application/zip"
          className="upload-stage__input"
          onChange={handleFileSelect}
          ref={fileInputRef}
          type="file"
        />

        <button className="upload-stage__dropzone" onClick={openFileDialog} type="button">
          <UploadIcon />
          <span className="upload-stage__title">Выбрать архив датасета</span>
          <span className="upload-stage__hint">Только `.zip`.</span>
        </button>

        {uploadMutation.isPending ? (
          <div className="upload-stage__loading">
            <Spinner label="Бэкенд проверяет архив." />
          </div>
        ) : null}

        <div className="upload-stage__actions">
          <Button onClick={openFileDialog}>Открыть проводник</Button>
        </div>

        <div className="info-card">
          <p className="info-card__text">
            Поддерживается один `.zip`-архив датасета.
          </p>
          <p className="info-card__text">
            Выбранный файл: <strong>{selectedFileName ?? 'ещё не выбран'}</strong>
          </p>
          <p className="info-card__text">
            Статус: <strong>{uploadMutation.isPending ? 'идёт обработка' : 'ожидание'}</strong>
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
