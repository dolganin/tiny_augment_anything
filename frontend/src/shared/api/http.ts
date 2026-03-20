import axios from 'axios'
import { env } from '@/shared/config/env'

export const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 30_000,
})
