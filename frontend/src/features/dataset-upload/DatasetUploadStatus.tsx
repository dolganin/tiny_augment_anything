import { Spinner } from '@/shared/ui/feedback/Spinner'

type DatasetUploadStatusProps = {
  importProgress: number
  isUploading: boolean
  onReset: () => void
  uploadProgress: number
  uploadStatusLabel: string
}

export function DatasetUploadStatus({
  importProgress,
  isUploading,
  onReset,
  uploadProgress,
  uploadStatusLabel,
}: DatasetUploadStatusProps) {
  return (
    <div className="upload-stage__loading">
      <div className="upload-stage__loading-head">
        <Spinner label={uploadStatusLabel} />
        <button
          aria-label="Сбросить загрузку"
          className="upload-stage__abort"
          onClick={onReset}
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
  )
}
