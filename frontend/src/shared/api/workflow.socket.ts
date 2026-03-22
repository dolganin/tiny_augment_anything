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

type WorkflowSocketListener = {
  onMessage?: (event: WorkflowSocketEvent) => void
  onError?: () => void
}

type WorkflowSocketConnection = {
  listeners: Set<WorkflowSocketListener>
  socket: WebSocket | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  closeTimer: ReturnType<typeof setTimeout> | null
  reconnectDelayMs: number
  destroyed: boolean
  errorNotified: boolean
}

const connections = new Map<string, WorkflowSocketConnection>()
const SOCKET_IDLE_TTL_MS = 15_000
const SOCKET_RECONNECT_MIN_MS = 1_000
const SOCKET_RECONNECT_MAX_MS = 8_000

function getConnection(sessionId: string) {
  let connection = connections.get(sessionId)
  if (!connection) {
    connection = {
      listeners: new Set(),
      socket: null,
      reconnectTimer: null,
      closeTimer: null,
      reconnectDelayMs: SOCKET_RECONNECT_MIN_MS,
      destroyed: false,
      errorNotified: false,
    }
    connections.set(sessionId, connection)
  }
  return connection
}

function notifyError(connection: WorkflowSocketConnection) {
  if (connection.errorNotified) {
    return
  }
  connection.errorNotified = true
  connection.listeners.forEach((listener) => listener.onError?.())
}

function connect(sessionId: string, connection: WorkflowSocketConnection) {
  if (connection.destroyed || connection.socket) {
    return
  }

  const socket = new WebSocket(buildSocketUrl(sessionId))
  connection.socket = socket

  socket.onopen = () => {
    connection.reconnectDelayMs = SOCKET_RECONNECT_MIN_MS
    connection.errorNotified = false
  }

  socket.onmessage = (event) => {
    let payload: unknown
    try {
      payload = JSON.parse(event.data)
    } catch {
      notifyError(connection)
      return
    }
    const parsedEvent = workflowSocketEventSchema.safeParse(payload)

    if (!parsedEvent.success) {
      notifyError(connection)
      return
    }

    connection.listeners.forEach((listener) => listener.onMessage?.(parsedEvent.data))
  }

  socket.onerror = () => {
    notifyError(connection)
  }

  socket.onclose = () => {
    connection.socket = null
    if (connection.destroyed) {
      return
    }
    if (connection.listeners.size === 0) {
      return
    }
    notifyError(connection)
    connection.reconnectTimer = setTimeout(() => {
      connection.reconnectTimer = null
      connect(sessionId, connection)
    }, connection.reconnectDelayMs)
    connection.reconnectDelayMs = Math.min(connection.reconnectDelayMs * 2, SOCKET_RECONNECT_MAX_MS)
  }
}

function subscribe(sessionId: string, listener: WorkflowSocketListener) {
  const connection = getConnection(sessionId)
  connection.destroyed = false
  if (connection.closeTimer) {
    clearTimeout(connection.closeTimer)
    connection.closeTimer = null
  }
  connection.listeners.add(listener)
  connect(sessionId, connection)

  return () => {
    const current = connections.get(sessionId)
    if (!current) {
      return
    }
    current.listeners.delete(listener)
    if (current.listeners.size > 0) {
      return
    }
    current.closeTimer = setTimeout(() => {
      const idle = connections.get(sessionId)
      if (!idle || idle.listeners.size > 0) {
        return
      }
      idle.destroyed = true
      if (idle.reconnectTimer) {
        clearTimeout(idle.reconnectTimer)
      }
      idle.socket?.close()
      connections.delete(sessionId)
    }, SOCKET_IDLE_TTL_MS)
  }
}

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

    const listener: WorkflowSocketListener = {
      onMessage: (event) => messageHandler.current?.(event),
      onError: () => errorHandler.current?.(),
    }

    return subscribe(sessionId, listener)
  }, [sessionId])
}
