import { PropsWithChildren, ReactNode } from 'react'
import { AppShell } from '@/shared/ui/layouts/AppShell'

type PageFrameProps = PropsWithChildren<{
  title: string
  description: string
  aside?: ReactNode
}>

export function PageFrame({ title, description, aside, children }: PageFrameProps) {
  return (
    <AppShell>
      <section className="page-frame">
        <header className="page-frame__header">
          <div>
            <p className="page-frame__eyebrow">Workflow stage</p>
            <h2 className="page-frame__title">{title}</h2>
          </div>
          <p className="page-frame__description">{description}</p>
        </header>

        <div className="page-frame__body">
          <div className="page-frame__main">{children}</div>
          {aside ? <aside className="page-frame__aside">{aside}</aside> : null}
        </div>
      </section>
    </AppShell>
  )
}
