import { ChangeEvent, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUploadDatasetMutation } from '@/shared/api/workflow.hooks'
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { useSessionStore } from '@/store/session/session.store'

export function UploadPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const resetSession = useSessionStore((state) => state.reset)
  const setSession = useSessionStore((state) => state.setSession)
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

      resetSession()
      setSession({
        sessionId: response.sessionId,
        datasetId: response.datasetId,
        datasetName: response.datasetName ?? file.name.replace(/\.zip$/i, ''),
        workflowStage: 'dataset-stats',
        fineTuneResolved: false,
        currentMode: null,
        selectedClasses: [],
      })

      navigate('/dataset/stats')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      event.target.value = ''
    }
  }

  return (
    <>
      <PageFrame
        title="Загрузка датасета"
        description="Загрузи zip-архив с датасетом. После успешной валидации интерфейс создаст рабочую сессию и переведёт тебя к статистике редких классов."
        aside={<UploadAside fileName={selectedFileName} isLoading={uploadMutation.isPending} />}
      >
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
            <span className="upload-stage__hint">Откроется проводник с фильтром только по `.zip`.</span>
          </button>

          {uploadMutation.isPending ? (
            <div className="upload-stage__loading">
              <Spinner label="Архив загружен. Бэкенд проверяет структуру датасета." />
            </div>
          ) : null}

          <div className="upload-stage__actions">
            <Button onClick={openFileDialog}>Открыть проводник</Button>
          </div>
        </div>
      </PageFrame>

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

function UploadAside({
  fileName,
  isLoading,
}: {
  fileName: string | null
  isLoading: boolean
}) {
  return (
    <div className="info-card">
      <p className="info-card__text">
        Поддерживается одиночный архив с layout датасета, который проверяется бэкендом.
      </p>
      <p className="info-card__text">
        Выбранный файл: <strong>{fileName ?? 'ещё не выбран'}</strong>
      </p>
      <p className="info-card__text">
        Статус: <strong>{isLoading ? 'идёт обработка' : 'ожидание загрузки'}</strong>
      </p>
    </div>
  )
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" className="upload-stage__icon" viewBox="0 0 120 120">
      <path
        d="M60 12C33.49 12 12 33.49 12 60s21.49 48 48 48 48-21.49 48-48S86.51 12 60 12Z"
        fill="url(#upload-gradient)"
        opacity="0.16"
      />
      <path
        d="M60 28v38m0-38 16 16M60 28 44 44M36 76h48"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="8"
      />
      <defs>
        <linearGradient id="upload-gradient" x1="12" x2="108" y1="12" y2="108">
          <stop offset="0%" stopColor="#72b7e0" />
          <stop offset="100%" stopColor="#3062bb" />
        </linearGradient>
      </defs>
    </svg>
  )
}
