import { type PersistedUploadSession } from '@/shared/lib/upload-session-storage'

type DatasetUploadMetaProps = {
  compact: boolean
  isBusy: boolean
  isImportPending: boolean
  selectedFileName: string | null
  showCompactMeta: boolean
  uploadPhase?: PersistedUploadSession['phase']
  uploadStatusLabel: string
}

export function DatasetUploadMeta({
  compact,
  isBusy,
  isImportPending,
  selectedFileName,
  showCompactMeta,
  uploadPhase,
  uploadStatusLabel,
}: DatasetUploadMetaProps) {
  if (compact) {
    if (!showCompactMeta) {
      return null
    }

    return (
      <div className="info-card upload-stage__meta-card">
        {selectedFileName ? (
          <p className="info-card__text">
            <strong>{selectedFileName}</strong>
          </p>
        ) : null}
        {isBusy || uploadPhase === 'uploading' || isImportPending ? (
          <p className="info-card__text">{uploadStatusLabel}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="info-card">
      <p className="info-card__text">Поддерживается один zip-архив датасета.</p>
      <p className="info-card__text">
        Выбранный файл: <strong>{selectedFileName ?? 'ещё не выбран'}</strong>
      </p>
      <p className="info-card__text">
        Статус: <strong>{uploadStatusLabel}</strong>
      </p>
    </div>
  )
}
