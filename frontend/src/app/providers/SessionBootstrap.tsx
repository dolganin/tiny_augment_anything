import { PropsWithChildren, useEffect } from 'react'
import { adaptSessionSnapshot } from '@/shared/api/adapters'
import { useRestoreSessionQuery } from '@/shared/api/workflow.hooks'
import { useSessionStore } from '@/store/session/session.store'

export function SessionBootstrap({ children }: PropsWithChildren) {
  const sessionId = useSessionStore((state) => state.sessionId)
  const setSession = useSessionStore((state) => state.setSession)
  const query = useRestoreSessionQuery(sessionId)

  useEffect(() => {
    if (!query.data) {
      return
    }

    setSession(adaptSessionSnapshot(query.data))
  }, [query.data, setSession])

  return children
}
