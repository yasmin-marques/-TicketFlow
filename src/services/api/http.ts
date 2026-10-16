import axios, { isAxiosError, type InternalAxiosRequestConfig } from 'axios'
import { mockAdapter } from '@/mocks/adapter'
import { authBridge } from './authBridge'

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

/**
 * Cliente HTTP único da aplicação. Em desenvolvimento sem backend, as
 * chamadas são atendidas por `mockAdapter`; com `VITE_USE_MOCKS=false` vão
 * para a API Spring Boot em `VITE_API_URL`.
 */
export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20_000,
  headers: { Accept: 'application/json' },
  ...(USE_MOCKS ? { adapter: mockAdapter } : {}),
})

/** Erro de API normalizado para as telas. `code` e `details` vêm do corpo da resposta. */
export class ApiError extends Error {
  readonly status: number | null
  readonly ref?: string
  readonly code?: string
  readonly details: Record<string, unknown>

  constructor(message: string, status: number | null, opts: { ref?: string; code?: string; details?: Record<string, unknown> } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.ref = opts.ref
    this.code = opts.code
    this.details = opts.details ?? {}
  }

  get isNotFound(): boolean {
    return this.status === 404
  }
}

/** Cabeçalho `Idempotency-Key` para operações que não podem repetir efeito. */
export const idempotencyHeaders = (key: string) => ({ 'Idempotency-Key': key })
export const newIdempotencyKey = () => crypto.randomUUID()

http.interceptors.request.use((config) => {
  const token = authBridge.getAccessToken()
  if (token && !config.url?.startsWith('/auth/')) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

type RetryableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!isAxiosError<{ message?: string; ref?: string; code?: string }>(error)) return Promise.reject(error)

    const status = error.response?.status ?? null
    const config = error.config as RetryableConfig | undefined

    // Access token vencido: renova uma vez (single-flight) e repete a chamada.
    if (status === 401 && config && !config._retried && !config.url?.startsWith('/auth/') && authBridge.getAccessToken()) {
      config._retried = true
      const token = await authBridge.refresh()
      if (token) return http(config)
      authBridge.onSessionLost()
    }

    const data = error.response?.data
    const message =
      data?.message ?? (status === null ? 'Sem conexão com o servidor.' : 'Não foi possível concluir a operação.')
    return Promise.reject(
      new ApiError(message, status, { ref: data?.ref, code: data?.code, details: (data ?? {}) as Record<string, unknown> }),
    )
  },
)
