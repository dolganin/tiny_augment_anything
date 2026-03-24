import { ChangeEvent, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/shared/ui/buttons/Button'
import { useDiffusionLoraAdaptersQuery } from '@/shared/api/workflow.hooks'
import { workflowApi } from '@/shared/api/workflow.api'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { TextInputModal } from '@/shared/ui/feedback/TextInputModal'

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
  const [isSavingName, setIsSavingName] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [pendingRename, setPendingRename] = useState<{
    adapterPath: string
    defaultName: string
    value: string
  } | null>(null)
  const selectedAdapter = useMemo(
    () => (adaptersQuery.data?.items ?? []).find((item) => item.adapterPath === selectedAdapterPath) ?? null,
    [adaptersQuery.data?.items, selectedAdapterPath],
  )

  const uploadLora = async (file: File) => {
    if (!sessionId) {
      onError('Сессия потеряна. Сначала восстанови проект, потом загрузи LoRA adapter.')
      return
    }
    try {
      setIsUploading(true)
      setUploadProgress(0)
      setPendingRename(null)
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
      setPendingRename({
        adapterPath: result.adapterPath,
        defaultName: result.displayName,
        value: result.displayName,
      })
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

  const saveName = async (value: string) => {
    if (!sessionId || !pendingRename) {
      return
    }
    try {
      setIsSavingName(true)
      await workflowApi.saveDiffusionLoraName(sessionId, pendingRename.adapterPath, value)
      await queryClient.invalidateQueries({ queryKey: ['workflow', 'diffusion-lora-adapters', sessionId] })
      setPendingRename(null)
    } catch (error) {
      onError(getErrorMessage(error))
    } finally {
      setIsSavingName(false)
    }
  }

  return (
    <>
      <section className="info-card">
        <div className="modify-panel__actions">
        <Button
          disabled={!sessionId || isUploading || isSavingName}
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
            disabled={!sessionId || adaptersQuery.isLoading || isUploading || isSavingName}
            onChange={(event) => onSelectAdapter(event.target.value)}
            value={selectedAdapterPath}
          >
            <option value="">Без LoRA</option>
            {(adaptersQuery.data?.items ?? []).map((item) => (
              <option key={item.adapterPath} value={item.adapterPath}>
                {item.displayName}
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
        {!isUploading && pendingRename ? (
          <p className="info-card__text">Загрузка завершена. Теперь задай имя адаптера.</p>
        ) : null}
        {!isUploading && selectedAdapter ? (
          <p className="info-card__text">
            Выбран адаптер: {selectedAdapter.displayName} ({selectedAdapter.fileName})
          </p>
        ) : null}
        {adaptersQuery.data && adaptersQuery.data.items.length === 0 ? (
          <p className="info-card__text">Для этого датасета пока нет загруженных LoRA adapter.</p>
        ) : null}
      </section>

      <TextInputModal
        defaultValue={pendingRename?.value ?? ''}
        description="Имя будет показано в списке LoRA адаптеров для текущего датасета."
        isSubmitting={isSavingName}
        label="Имя LoRA"
        onClose={() => setPendingRename(null)}
        onConfirm={(value) => void saveName(value)}
        onReset={() =>
          setPendingRename((current) => (current ? { ...current, value: current.defaultName } : current))
        }
        open={Boolean(pendingRename)}
        placeholder="Например, Skin lesion cleanup"
        title="Сохранить LoRA adapter"
      />
    </>
  )
}
