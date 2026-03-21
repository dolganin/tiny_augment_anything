import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adaptDatasetCatalog, adaptSessionSnapshot } from '@/shared/api/adapters'
import { useActivateDatasetMutation, useDatasetsCatalogQuery } from '@/shared/api/workflow.hooks'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { DatasetUploadPanel } from '@/features/dataset-upload/DatasetUploadPanel'
import { DatasetCatalog } from '@/features/dataset-library/DatasetCatalog'
import { workflowStagePaths, type DatasetCatalogItem } from '@/shared/types/workflow'
import { useSessionStore } from '@/store/session/session.store'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { Modal } from '@/shared/ui/feedback/Modal'

export function HomePage() {
  const navigate = useNavigate()
  const activeSessionId = useSessionStore((state) => state.sessionId)
  const replaceSession = useSessionStore((state) => state.replaceSession)
  const catalogQuery = useDatasetsCatalogQuery()
  const activateDatasetMutation = useActivateDatasetMutation()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [openingDatasetId, setOpeningDatasetId] = useState<string | null>(null)

  const items = useMemo(
    () => (catalogQuery.data ? adaptDatasetCatalog(catalogQuery.data) : []),
    [catalogQuery.data],
  )

  const handleOpenDataset = async (item: DatasetCatalogItem) => {
    setOpeningDatasetId(item.datasetId)
    try {
      const snapshot = await activateDatasetMutation.mutateAsync(item.datasetId)
      const adaptedSnapshot = adaptSessionSnapshot(snapshot)
      replaceSession(adaptedSnapshot)
      navigate(workflowStagePaths[adaptedSnapshot.workflowStage])
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setOpeningDatasetId(null)
    }
  }

  return (
    <>
      <PageFrame
        title="Рабочий стол датасетов"
        description="Открой существующий датасет или загрузи новый архив и продолжи пайплайн с нужного шага."
        aside={<DatasetUploadPanel />}
      >
        <DatasetCatalog
          activeSessionId={activeSessionId}
          isLoading={catalogQuery.isLoading}
          items={items}
          onOpenDataset={handleOpenDataset}
          openingDatasetId={openingDatasetId}
        />
      </PageFrame>

      <Modal
        onClose={() => setErrorMessage(null)}
        open={Boolean(errorMessage)}
        title="Ошибка каталога"
        tone="error"
      >
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>
    </>
  )
}
