import { type ChangeEvent, type RefObject } from 'react'
import { DatasetUploadIcon } from './DatasetUploadIcon'

type DatasetUploadDropzoneProps = {
  disabled: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  hint: string
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onOpenFileDialog: () => void
  title: string
}

export function DatasetUploadDropzone({
  disabled,
  fileInputRef,
  hint,
  onFileChange,
  onOpenFileDialog,
  title,
}: DatasetUploadDropzoneProps) {
  return (
    <>
      <input
        accept=".zip,application/zip"
        className="upload-stage__input"
        disabled={disabled}
        onChange={onFileChange}
        ref={fileInputRef}
        type="file"
      />

      <button className="upload-stage__dropzone" disabled={disabled} onClick={onOpenFileDialog} type="button">
        <DatasetUploadIcon />
        <span className="upload-stage__title">{title}</span>
        <span className="upload-stage__hint">{hint}</span>
      </button>
    </>
  )
}
