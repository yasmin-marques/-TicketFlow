import axios, { isAxiosError } from 'axios'
import { mockAdapter } from '@/mocks/adapter'

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'

/**
 * Cliente HTTP único da aplicação. Em desenvolvimento sem backend, as
 * chamadas são atendidas por `mockAdapter`; com `VITE_USE_MOCKS=false` vão
 * para a API Spring Boot em `VITE_API_URL`.
 */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  timeout: 15_000,
  headers: { Accept: 'application/json' },
  ...(USE_MOCKS ? { adapter: mockAdapter } : {}),
})

/** Erro de API normalizado para as telas. */
export class ApiError extends Error {
  readonly status: number | null
  readonly ref?: string

  constructor(message: string, status: number | null, ref?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.ref = ref
  }

  get isNotFound(): boolean {
    return this.status === 404
  }
}

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (isAxiosError<{ message?: string; ref?: string }>(error)) {
      const status = error.response?.status ?? null
      const message =
        error.response?.data?.message ??
        (status === null ? 'Sem conexão com o servidor.' : 'Não foi possível concluir a operação.')
      return Promise.reject(new ApiError(message, status, error.response?.data?.ref))
    }
    return Promise.reject(error)
  },
)
