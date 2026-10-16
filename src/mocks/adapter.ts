import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { type Db, type DbUser, getDb, saveDb } from './db'
import { Created, HttpError } from './httpError'
import { getMockMode, type MockMode } from './mode'
import { registerAccountRoutes } from './routes/account'
import { registerAuthRoutes } from './routes/auth'
import { registerEventRoutes } from './routes/events'
import { syncCatalogFromOrg } from './org/catalog'
import { getOrg } from './org/store'
import { registerOrderRoutes } from './routes/orders'
import { registerOrgRoutes } from './routes/org'
import { registerReservationRoutes } from './routes/reservations'
import { registerTicketRoutes } from './routes/tickets'

export interface RouteCtx {
  params: Record<string, string>
  query: Record<string, string | number | undefined>
  body: Record<string, unknown>
  headers: AxiosHeaders
  db: Db
  user: DbUser | null
  mode: MockMode
}

export type Handler = (ctx: RouteCtx) => unknown | Promise<unknown>
export type AddRoute = (method: string, path: string, handler: Handler, opts?: { auth?: boolean }) => void

interface RouteDef {
  method: string
  regex: RegExp
  keys: string[]
  handler: Handler
  auth: boolean
}

const routes: RouteDef[] = []

const add: AddRoute = (method, path, handler, opts) => {
  const keys: string[] = []
  const pattern = path.replace(/:([A-Za-z]+)/g, (_, key: string) => {
    keys.push(key)
    return '([^/]+)'
  })
  routes.push({ method, regex: new RegExp(`^${pattern}$`), keys, handler, auth: opts?.auth ?? false })
}

registerEventRoutes(add)
registerAuthRoutes(add)
registerReservationRoutes(add)
registerOrderRoutes(add)
registerTicketRoutes(add)
registerAccountRoutes(add)
registerOrgRoutes(add)

/** Eventos criados no painel e publicados em sessões anteriores voltam ao catálogo público. */
let orgSynced = false
function ensureOrgSynced() {
  if (orgSynced) return
  orgSynced = true
  syncCatalogFromOrg(getOrg())
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function respond<T>(config: InternalAxiosRequestConfig, status: number, data: T): AxiosResponse<T> {
  return { data, status, statusText: String(status), headers: new AxiosHeaders(), config }
}

function toAxiosError(config: InternalAxiosRequestConfig, err: HttpError): AxiosError {
  const body = { status: err.status, code: err.code, message: err.message, ...err.extra }
  return new AxiosError(
    err.message,
    err.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
    config,
    null,
    respond(config, err.status, body),
  )
}

/** Tokens fictícios: `mock.<userId>.<expiraEmMs>`. NÃO é JWT — ver mocks/routes/auth.ts. */
function userFromToken(db: Db, header: string | null): DbUser | null {
  if (!header?.startsWith('Bearer ')) return null
  const [prefix, userId, exp] = header.slice(7).split('.')
  if (prefix !== 'mock' || !userId || !exp) return null
  if (Number(exp) < Date.now()) throw new HttpError(401, 'TOKEN_EXPIRED', 'Sessão expirada')
  return db.users.find((u) => u.id === userId) ?? null
}

function parseBody(data: unknown): Record<string, unknown> {
  if (!data) return {}
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return data as Record<string, unknown>
}

/**
 * Adapter do axios que implementa o "backend" localmente. Os contratos
 * (rotas, query string, cabeçalhos, JSON, códigos de status) são os que a API
 * Spring Boot deve expor — veja docs/API-CONTRACTS.md. Desligue com
 * `VITE_USE_MOCKS=false` para falar com a API real.
 */
export const mockAdapter: AxiosAdapter = async (config) => {
  const mode = getMockMode()
  await delay(mode === 'lento' ? 3000 : 200 + Math.random() * 250)

  try {
    if (mode === 'erro') throw new HttpError(500, 'INTERNAL_ERROR', 'Erro interno simulado', { ref: '7f3a-91c2' })

    const path = (config.url ?? '').split('?')[0] ?? ''
    const method = (config.method ?? 'get').toUpperCase()
    const db = getDb()
    ensureOrgSynced()

    const def = routes.find((r) => r.method === method && r.regex.test(path))
    if (!def) {
      const known = routes.some((r) => r.regex.test(path))
      throw known
        ? new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não suportado')
        : new HttpError(404, 'NOT_FOUND', `Rota ${path} não existe no mock`)
    }

    const match = def.regex.exec(path)!
    const params = Object.fromEntries(def.keys.map((k, i) => [k, decodeURIComponent(match[i + 1] ?? '')]))
    const headers = AxiosHeaders.from(config.headers)
    const user = userFromToken(db, headers.get('Authorization') as string | null)
    if (def.auth && !user) throw new HttpError(401, 'UNAUTHENTICATED', 'Faça login para continuar')

    const ctx: RouteCtx = {
      params,
      query: (config.params ?? {}) as RouteCtx['query'],
      body: parseBody(config.data),
      headers,
      db,
      user,
      mode,
    }

    // Idempotência: a mesma chave devolve a mesma resposta, sem repetir o efeito.
    const idemKey = headers.get('Idempotency-Key') as string | null
    const storeKey = idemKey && user ? `${user.id}:${method}:${path}:${idemKey}` : null
    if (storeKey && db.idempotency[storeKey]) {
      const hit = db.idempotency[storeKey]!
      if (hit.status >= 400) {
        const d = hit.data as { code: string; message: string }
        throw new HttpError(hit.status, d.code, d.message, hit.data as Record<string, unknown>)
      }
      return respond(config, hit.status, hit.data)
    }

    try {
      const result = await def.handler(ctx)
      const status = result instanceof Created ? 201 : 200
      const data = result instanceof Created ? result.data : result
      if (storeKey) db.idempotency[storeKey] = { status, data }
      saveDb()
      return respond(config, status, data)
    } catch (err) {
      if (err instanceof HttpError && storeKey && err.status < 500) {
        db.idempotency[storeKey] = { status: err.status, data: { code: err.code, message: err.message, ...err.extra } }
        saveDb()
      }
      throw err
    }
  } catch (err) {
    if (err instanceof HttpError) throw toAxiosError(config, err)
    throw err
  }
}
