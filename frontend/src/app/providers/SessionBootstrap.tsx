import { PropsWithChildren, useEffect } from 'react'
import { adaptSessionSnapshot } from '@/shared/api/adapters'
import { useRestoreSessionQuery } from '@/shared/api/workflow.hooks'
import { useSessionStore } from '@/store/session/session.store'

export function SessionBootstrap({ children }: PropsWithChildren) {
  const sessionId = useSessionStore((state) => state.sessionId)
  const replaceSession = useSessionStore((state) => state.replaceSession)
  const query = useRestoreSessionQuery(sessionId)

  useEffect(() => {
    if (!query.data) {
      return
    }

    replaceSession(adaptSessionSnapshot(query.data))
  }, [query.data, replaceSession])

  return children
}
