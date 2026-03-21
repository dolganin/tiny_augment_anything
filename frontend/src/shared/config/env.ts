const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const toAbsoluteUrl = (value: string, mode: 'http' | 'ws') => {
  if (/^https?:\/\//.test(value) || /^wss?:\/\//.test(value)) {
    return trimTrailingSlash(value)
  }

  if (typeof window === 'undefined') {
    return trimTrailingSlash(value)
  }

  const normalizedPath = value.startsWith('/') ? value : `/${value}`

  if (mode === 'ws') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return trimTrailingSlash(`${protocol}//${window.location.host}${normalizedPath}`)
  }

  return trimTrailingSlash(`${window.location.origin}${normalizedPath}`)
}

const apiBaseUrl = toAbsoluteUrl(import.meta.env.VITE_API_BASE_URL ?? '/api', 'http')
const wsBaseUrl = toAbsoluteUrl(import.meta.env.VITE_WS_BASE_URL ?? '/ws', 'ws')

export const env = {
  apiBaseUrl,
  wsBaseUrl,
}
