import { ChangeEvent, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/shared/ui/buttons/Button'
import { useDiffusionLoraAdaptersQuery } from '@/shared/api/workflow.hooks'
import { workflowApi } from '@/shared/api/workflow.api'
import { getErrorMessage } from '@/shared/lib/get-error-message'

type DiffusionLoraPanelProps = {
  onError: (message: string) => void
  onSelectAdapter: (adapterPath: string) => void
  selectedAdapterPath: string
  sessionId: string | null
}

export function DiffusionLoraPanel({
  onError,
  onSelectAdapter,
  selectedAdapterPath,
  sessionId,
}: DiffusionLoraPanelProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const adaptersQuery = useDiffusionLoraAdaptersQuery(sessionId)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const uploadLora = async (file: File) => {
    if (!sessionId) {
      onError('Сессия потеряна. Сначала восстанови проект, потом загрузи LoRA adapter.')
      return
    }
    try {
      setIsUploading(true)
      setUploadProgress(0)
      const initialized = await workflowApi.initDiffusionLoraUpload(sessionId, file.name, file.size)
      for (let partNumber = 0; partNumber < initialized.totalParts; partNumber += 1) {
        const start = partNumber * initialized.chunkSize
        const end = Math.min(file.size, start + initialized.chunkSize)
        const chunk = file.slice(start, end)
        await workflowApi.uploadDiffusionLoraChunk(
          sessionId,
          initialized.uploadId,
          partNumber,
          initialized.totalParts,
          chunk,
          undefined,
          (chunkProgress) => {
            const uploadedBytes = start + Math.round(chunk.size * chunkProgress)
            const progress = file.size === 0 ? 100 : Math.min(100, Math.round((uploadedBytes / file.size) * 100))
            setUploadProgress(progress)
          },
        )
      }
      const result = await workflowApi.completeDiffusionLoraUpload(sessionId, initialized.uploadId)
      await queryClient.invalidateQueries({ queryKey: ['workflow', 'diffusion-lora-adapters', sessionId] })
      onSelectAdapter(result.adapterPath)
      setUploadProgress(100)
    } catch (error) {
      onError(getErrorMessage(error))
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      return
    }
    void uploadLora(file)
  }

  return (
    <section className="info-card">
      <div className="modify-panel__actions">
        <Button
          disabled={!sessionId || isUploading}
          onClick={() => fileInputRef.current?.click()}
          type="button"
          variant="secondary"
        >
          Загрузить LoRA adapter
        </Button>
        <label className="generation-form__group" style={{ minWidth: 260 }}>
          <span className="generation-form__label">LoRA adapter</span>
          <select
            className="generation-form__input"
            disabled={!sessionId || adaptersQuery.isLoading || isUploading}
            onChange={(event) => onSelectAdapter(event.target.value)}
            value={selectedAdapterPath}
          >
            <option value="">Без LoRA</option>
            {(adaptersQuery.data?.items ?? []).map((item) => (
              <option key={item.adapterPath} value={item.adapterPath}>
                {item.fileName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <input
        accept=".bin,.ckpt,.pt,.pth,.safetensors"
        className="upload-stage__input"
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />

      {isUploading ? <p className="info-card__text">Загрузка LoRA adapter: {uploadProgress}%</p> : null}
      {!isUploading && selectedAdapterPath ? (
        <p className="info-card__text">Выбран адаптер: {selectedAdapterPath}</p>
      ) : null}
      {adaptersQuery.data && adaptersQuery.data.items.length === 0 ? (
        <p className="info-card__text">Пока нет загруженных LoRA adapter.</p>
      ) : null}
    </section>
  )
}
