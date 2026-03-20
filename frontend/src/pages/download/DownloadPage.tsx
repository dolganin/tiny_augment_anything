import { useEffect } from 'react'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { useSessionStore } from '@/store/session/session.store'
import { DownloadCard } from '@/features/dataset-download/DownloadCard'

export function DownloadPage() {
  const downloadUrl = useSessionStore((state) => state.downloadUrl)
  const setSession = useSessionStore((state) => state.setSession)

  useEffect(() => {
    setSession({ workflowStage: 'download' })
  }, [setSession])

  return (
    <PageFrame
      title="Скачивание итогового датасета"
      description="Архив уже собран на стороне бэкенда и доступен для немедленного скачивания."
    >
      {downloadUrl ? <DownloadCard downloadUrl={downloadUrl} /> : null}
    </PageFrame>
  )
}
