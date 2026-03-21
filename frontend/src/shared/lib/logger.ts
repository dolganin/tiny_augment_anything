type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const configuredLevel = resolveLevel()

export const logger = {
  debug(event: string, fields?: Record<string, unknown>) {
    writeLog('debug', event, fields)
  },
  info(event: string, fields?: Record<string, unknown>) {
    writeLog('info', event, fields)
  },
  warn(event: string, fields?: Record<string, unknown>) {
    writeLog('warn', event, fields)
  },
  error(event: string, fields?: Record<string, unknown>) {
    writeLog('error', event, fields)
  },
}

function resolveLevel(): LogLevel {
  const rawValue = import.meta.env.VITE_LOG_LEVEL
  if (rawValue === 'debug' || rawValue === 'info' || rawValue === 'warn' || rawValue === 'error') {
    return rawValue
  }
  return import.meta.env.DEV ? 'info' : 'warn'
}

function writeLog(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
  if (levelOrder[level] < levelOrder[configuredLevel]) {
    return
  }
  const payload = {
    ts: new Date().toISOString(),
    event,
    ...fields,
  }
  if (level === 'error') {
    console.error('[tiny-augment]', payload)
    return
  }
  if (level === 'warn') {
    console.warn('[tiny-augment]', payload)
    return
  }
  console.log('[tiny-augment]', payload)
}
