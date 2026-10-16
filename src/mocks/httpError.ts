/** Erro HTTP lançado pelos handlers mock; o adapter o converte em AxiosError. */
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly extra: Record<string, unknown>

  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

/** Resposta 201. */
export class Created<T = unknown> {
  readonly data: T
  constructor(data: T) {
    this.data = data
  }
}
