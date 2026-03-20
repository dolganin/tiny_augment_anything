import { PropsWithChildren } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { QueryProvider } from '@/app/providers/QueryProvider'

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <BrowserRouter>
      <QueryProvider>{children}</QueryProvider>
    </BrowserRouter>
  )
}
