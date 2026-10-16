import type {
  CategorySlug,
  EventFilters,
  EventSort,
  WhenFilter,
} from '@/types/event'

/**
 * Contrato de query string entre front e API para `GET /events`.
 * `toApiParams` serializa os filtros; `parseEventFilters` faz o caminho
 * inverso (usado pelo servidor mock — o backend real implementa o seu).
 */
export type ApiParams = Record<string, string | number | undefined>

export const EMPTY_FILTERS: EventFilters = {
  q: '',
  city: '',
  from: '',
  to: '',
  categories: [],
  minPrice: null,
  maxPrice: null,
  when: null,
  seatMapOnly: false,
  sort: 'data',
  page: 1,
}

export function toApiParams(filters: EventFilters, pageSize: number): ApiParams {
  return {
    q: filters.q || undefined,
    city: filters.city || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    categories: filters.categories.length ? filters.categories.join(',') : undefined,
    minPrice: filters.minPrice ?? undefined,
    maxPrice: filters.maxPrice ?? undefined,
    when: filters.when ?? undefined,
    seatMapOnly: filters.seatMapOnly ? 'true' : undefined,
    sort: filters.sort,
    page: filters.page,
    pageSize,
  }
}

const SORTS: ReadonlyArray<EventSort> = ['data', 'recentes', 'preco', 'distancia']
const WHENS: ReadonlyArray<WhenFilter> = ['hoje', 'fim-de-semana', 'mes']

const optNum = (v: unknown): number | null => {
  if (v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function parseEventFilters(params: Record<string, unknown>): EventFilters {
  const sort = String(params.sort ?? '')
  const when = String(params.when ?? '')
  return {
    q: String(params.q ?? ''),
    city: String(params.city ?? ''),
    from: String(params.from ?? ''),
    to: String(params.to ?? ''),
    categories: String(params.categories ?? '')
      .split(',')
      .filter(Boolean) as CategorySlug[],
    minPrice: optNum(params.minPrice),
    maxPrice: optNum(params.maxPrice),
    when: WHENS.includes(when as WhenFilter) ? (when as WhenFilter) : null,
    seatMapOnly: params.seatMapOnly === 'true',
    sort: SORTS.includes(sort as EventSort) ? (sort as EventSort) : 'data',
    page: Math.max(1, optNum(params.page) ?? 1),
  }
}
