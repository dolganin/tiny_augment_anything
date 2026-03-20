import { useEffect, useRef } from 'react'
import { workflowSocketEventSchema, WorkflowSocketEvent } from '@/shared/api/contracts'
import { endpoints } from '@/shared/api/endpoints'
import { env } from '@/shared/config/env'

type WorkflowSocketOptions = {
  sessionId: string | null
  onMessage?: (event: WorkflowSocketEvent) => void
  onError?: () => void
}

const buildSocketUrl = (sessionId: string) => `${env.wsBaseUrl}${endpoints.workflowSocket(sessionId)}`

export function useWorkflowSocket({ sessionId, onMessage, onError }: WorkflowSocketOptions) {
  const messageHandler = useRef(onMessage)
  const errorHandler = useRef(onError)

  useEffect(() => {
    messageHandler.current = onMessage
    errorHandler.current = onError
  }, [onMessage, onError])

  useEffect(() => {
    if (!sessionId) {
      return
    }

    const socket = new WebSocket(buildSocketUrl(sessionId))

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data)
      const parsedEvent = workflowSocketEventSchema.safeParse(payload)

      if (!parsedEvent.success) {
        errorHandler.current?.()
        return
      }

      messageHandler.current?.(parsedEvent.data)
    }

    socket.onerror = () => {
      errorHandler.current?.()
    }

    return () => {
      socket.close()
    }
  }, [sessionId])
}
