import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adaptDatasetCatalog, adaptSessionSnapshot } from '@/shared/api/adapters'
import { useActivateDatasetMutation, useDatasetsCatalogQuery, useDeleteDatasetMutation, useRenameDatasetMutation } from '@/shared/api/workflow.hooks'
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
  const activeDatasetId = useSessionStore((state) => state.datasetId)
  const replaceSession = useSessionStore((state) => state.replaceSession)
  const resetSession = useSessionStore((state) => state.reset)
  const catalogQuery = useDatasetsCatalogQuery()
  const activateDatasetMutation = useActivateDatasetMutation()
  const renameDatasetMutation = useRenameDatasetMutation()
  const deleteDatasetMutation = useDeleteDatasetMutation()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [openingDatasetId, setOpeningDatasetId] = useState<string | null>(null)
  const [pendingProject, setPendingProject] = useState<DatasetCatalogItem | null>(null)

  const items = useMemo(() => {
    const serverItems = catalogQuery.data ? adaptDatasetCatalog(catalogQuery.data) : []
    if (!pendingProject) {
      return serverItems
    }
    const existingIndex = serverItems.findIndex((item) => item.datasetId === pendingProject.datasetId)
    if (existingIndex === -1) {
      return [pendingProject, ...serverItems]
    }
    return serverItems.map((item) => (item.datasetId === pendingProject.datasetId ? pendingProject : item))
  }, [catalogQuery.data, pendingProject])

  const handleOpenDataset = async (item: DatasetCatalogItem) => {
    if (item.datasetId.startsWith('pending-')) {
      return
    }
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

  const handleRenameDataset = async (item: DatasetCatalogItem, name: string) => {
    try {
      await renameDatasetMutation.mutateAsync({ datasetId: item.datasetId, name })
      if (pendingProject?.datasetId === item.datasetId) {
        setPendingProject({ ...pendingProject, datasetName: name.trim() || pendingProject.datasetName })
      }
      await catalogQuery.refetch()
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
      throw error
    }
  }

  const handleDeleteDataset = async (item: DatasetCatalogItem) => {
    try {
      await deleteDatasetMutation.mutateAsync(item.datasetId)
      if (activeDatasetId === item.datasetId) {
        resetSession()
        navigate('/datasets')
      }
      if (pendingProject?.datasetId === item.datasetId) {
        setPendingProject(null)
      }
      await Promise.all([catalogQuery.refetch()])
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
      throw error
    }
  }

  return (
    <>
      <PageFrame
        title="Датасеты"
        description="Загрузи новый архив или открой существующий проект и продолжи пайплайн с нужного шага."
        aside={<DatasetUploadPanel onProjectChange={setPendingProject} />}
      >
        <DatasetCatalog
          activeSessionId={activeSessionId}
          deletingDatasetId={deleteDatasetMutation.isPending ? deleteDatasetMutation.variables ?? null : null}
          isLoading={catalogQuery.isLoading}
          items={items}
          onDeleteDataset={handleDeleteDataset}
          onOpenDataset={handleOpenDataset}
          onRenameDataset={handleRenameDataset}
          openingDatasetId={openingDatasetId}
          renamingDatasetId={renameDatasetMutation.isPending ? renameDatasetMutation.variables?.datasetId ?? null : null}
        />
      </PageFrame>

      <Modal onClose={() => setErrorMessage(null)} open={Boolean(errorMessage)} title="Ошибка каталога" tone="error">
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>
    </>
  )
}
