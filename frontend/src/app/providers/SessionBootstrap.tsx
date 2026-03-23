import { PropsWithChildren, useEffect } from 'react'
import axios from 'axios'
import { adaptSessionSnapshot } from '@/shared/api/adapters'
import { useRestoreSessionQuery } from '@/shared/api/workflow.hooks'
import { useSessionStore } from '@/store/session/session.store'

export function SessionBootstrap({ children }: PropsWithChildren) {
  const sessionId = useSessionStore((state) => state.sessionId)
  const replaceSession = useSessionStore((state) => state.replaceSession)
  const resetSession = useSessionStore((state) => state.reset)
  const query = useRestoreSessionQuery(sessionId)

  useEffect(() => {
    if (!query.data) {
      return
    }

    replaceSession(adaptSessionSnapshot(query.data))
  }, [query.data, replaceSession])

  useEffect(() => {
    if (!query.error || !sessionId || !axios.isAxiosError(query.error)) {
      return
    }
    const statusCode = query.error.response?.status ?? 0
    if (statusCode === 404 || statusCode >= 500) {
      resetSession()
    }
  }, [query.error, resetSession, sessionId])

  return children
}
