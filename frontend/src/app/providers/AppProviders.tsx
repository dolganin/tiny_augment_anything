import { PropsWithChildren } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { QueryProvider } from '@/app/providers/QueryProvider'
import { SessionBootstrap } from '@/app/providers/SessionBootstrap'

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <BrowserRouter>
      <QueryProvider>
        <SessionBootstrap>{children}</SessionBootstrap>
      </QueryProvider>
    </BrowserRouter>
  )
}
