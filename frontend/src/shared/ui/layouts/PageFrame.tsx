import { PropsWithChildren, ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { AppShell } from '@/shared/ui/layouts/AppShell'
import { WorkflowStageNav } from '@/shared/ui/layouts/WorkflowStageNav'
import { useSessionStore } from '@/store/session/session.store'

type PageFrameProps = PropsWithChildren<{
  title: string
  description: string
  aside?: ReactNode
}>

export function PageFrame({ title, description, aside, children }: PageFrameProps) {
  const location = useLocation()
  const datasetId = useSessionStore((state) => state.datasetId)
  const datasetName = useSessionStore((state) => state.datasetName)
  const showDatasetBanner = Boolean(datasetId) && !['/', '/datasets'].includes(location.pathname)

  return (
    <AppShell>
      <section className="page-frame">
        {showDatasetBanner ? (
          <div className="page-frame__dataset-banner">
            <span className="page-frame__dataset-label">Активный датасет</span>
            <strong className="page-frame__dataset-name">{datasetName ?? datasetId}</strong>
          </div>
        ) : null}

        <header className="page-frame__header">
          <div>
            <p className="page-frame__eyebrow">Workflow stage</p>
            <h2 className="page-frame__title">{title}</h2>
          </div>
          <p className="page-frame__description">{description}</p>
        </header>

        <WorkflowStageNav />

        <div className={aside ? 'page-frame__body' : 'page-frame__body page-frame__body--single'}>
          <div className="page-frame__main">{children}</div>
          {aside ? <aside className="page-frame__aside">{aside}</aside> : null}
        </div>
      </section>
    </AppShell>
  )
}
