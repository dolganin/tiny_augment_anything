const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const apiBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api')
const wsBaseUrl = trimTrailingSlash(import.meta.env.VITE_WS_BASE_URL ?? 'ws://localhost:8000/ws')

export const env = {
  apiBaseUrl,
  wsBaseUrl,
}
