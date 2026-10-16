import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { parseEventFilters } from '@/services/api/eventParams'
import {
  getEventBySlug,
  listCategories,
  listEvents,
  listFeatured,
  listRelated,
  listUpcoming,
  suggest,
} from './server'
import { getMockMode } from './mode'

type Params = Record<string, string | number | undefined>

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function respond<T>(config: InternalAxiosRequestConfig, status: number, data: T): AxiosResponse<T> {
  return { data, status, statusText: String(status), headers: new AxiosHeaders(), config }
}

function fail(config: InternalAxiosRequestConfig, status: number, message: string): never {
  throw new AxiosError(
    message,
    status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
    config,
    null,
    respond(config, status, { status, message, ref: '7f3a-91c2' }),
  )
}

const num = (v: unknown, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) && v !== '' && v !== undefined ? n : fallback
}

/**
 * Adapter do axios que atende às rotas `/events*` e `/categories` com os dados
 * mockados. Os contratos (rotas, query string, formato JSON) são os que o
 * backend Spring Boot deve expor — trocar por chamadas reais é só desligar
 * `VITE_USE_MOCKS`.
 */
export const mockAdapter: AxiosAdapter = async (config) => {
  const mode = getMockMode()
  await delay(mode === 'lento' ? 3000 : 350 + Math.random() * 350)

  if (mode === 'erro') fail(config, 500, 'Erro interno simulado')

  const path = (config.url ?? '').split('?')[0] ?? ''
  const params = (config.params ?? {}) as Params
  const method = (config.method ?? 'get').toLowerCase()

  if (method !== 'get') fail(config, 405, 'Método não suportado nesta etapa')

  if (path === '/events') {
    const filters = parseEventFilters(params)
    const pageSize = num(params.pageSize, 12)
    if (mode === 'vazio') {
      return respond(config, 200, { items: [], total: 0, page: 1, pageSize, totalPages: 1 })
    }
    return respond(config, 200, listEvents(filters, pageSize))
  }

  if (path === '/events/featured') {
    return respond(config, 200, mode === 'vazio' ? [] : listFeatured())
  }

  if (path === '/events/upcoming') {
    const items =
      mode === 'vazio'
        ? []
        : listUpcoming(String(params.city ?? ''), num(params.limit, 5), params.category ? String(params.category) : undefined)
    return respond(config, 200, items)
  }

  if (path === '/events/suggest') {
    return respond(config, 200, suggest(String(params.q ?? ''), num(params.limit, 5)))
  }

  if (path === '/categories') {
    return respond(config, 200, listCategories())
  }

  const related = /^\/events\/([^/]+)\/related$/.exec(path)
  if (related?.[1]) {
    return respond(config, 200, listRelated(decodeURIComponent(related[1]), num(params.limit, 3)))
  }

  const detail = /^\/events\/([^/]+)$/.exec(path)
  if (detail?.[1]) {
    const event = getEventBySlug(decodeURIComponent(detail[1]))
    if (!event) fail(config, 404, 'Evento não encontrado')
    return respond(config, 200, event)
  }

  return fail(config, 404, `Rota ${path} não existe no mock`)
}
