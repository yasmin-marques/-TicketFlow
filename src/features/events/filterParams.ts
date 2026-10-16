import { EMPTY_FILTERS } from '@/services/api/eventParams'
import type { CategorySlug, EventFilters, EventSort, WhenFilter } from '@/types/event'
import { PRICE_RANGE, SORT_OPTIONS, WHEN_OPTIONS } from './constants'

/**
 * Serialização dos filtros na URL de /eventos (querystring em pt-BR):
 * ?q=&cidade=&de=&ate=&cat=musica,cultura&min=&max=&quando=&assento=1&ord=&pagina=
 * Parâmetro ausente = valor padrão. `cidade=todas` = sem filtro de cidade.
 */
export interface FilterDefaults {
  city: string
  categories: CategorySlug[]
}

const ALL_CITIES = 'todas'

const isSort = (v: string | null): v is EventSort => SORT_OPTIONS.some((o) => o.value === v)
const isWhen = (v: string | null): v is WhenFilter => WHEN_OPTIONS.some((o) => o.value === v)

const toPrice = (v: string | null): number | null => {
  if (v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function parseFilters(params: URLSearchParams, defaults: FilterDefaults): EventFilters {
  const cidade = params.get('cidade')
  const sort = params.get('ord')
  const when = params.get('quando')
  const pagina = Number(params.get('pagina'))

  return {
    q: params.get('q')?.trim() ?? '',
    city: cidade === null ? defaults.city : cidade === ALL_CITIES ? '' : cidade,
    from: params.get('de') ?? '',
    to: params.get('ate') ?? '',
    categories: params.has('cat')
      ? (params.get('cat') ?? '').split(',').filter(Boolean) as CategorySlug[]
      : defaults.categories,
    minPrice: toPrice(params.get('min')),
    maxPrice: toPrice(params.get('max')),
    when: isWhen(when) ? when : null,
    seatMapOnly: params.get('assento') === '1',
    sort: isSort(sort) ? sort : EMPTY_FILTERS.sort,
    page: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
  }
}

export function serializeFilters(filters: EventFilters, defaults: FilterDefaults): URLSearchParams {
  const p = new URLSearchParams()
  if (filters.q) p.set('q', filters.q)
  if (filters.city !== defaults.city) p.set('cidade', filters.city === '' ? ALL_CITIES : filters.city)
  if (filters.from) p.set('de', filters.from)
  if (filters.to) p.set('ate', filters.to)
  const sameCategories =
    filters.categories.length === defaults.categories.length &&
    filters.categories.every((c) => defaults.categories.includes(c))
  if (!sameCategories) p.set('cat', filters.categories.join(','))
  if (filters.minPrice !== null) p.set('min', String(filters.minPrice))
  if (filters.maxPrice !== null) p.set('max', String(filters.maxPrice))
  if (filters.when) p.set('quando', filters.when)
  if (filters.seatMapOnly) p.set('assento', '1')
  if (filters.sort !== EMPTY_FILTERS.sort) p.set('ord', filters.sort)
  if (filters.page > 1) p.set('pagina', String(filters.page))
  return p
}

/** Faixa de preço efetiva para o slider (pontas = sem limite). */
export function priceBounds(filters: Pick<EventFilters, 'minPrice' | 'maxPrice'>): [number, number] {
  return [filters.minPrice ?? PRICE_RANGE.min, filters.maxPrice ?? PRICE_RANGE.max]
}

/** Quantos filtros (além de busca/ordenação) estão ativos — badge "Filtros · 2". */
export function countActiveFilters(filters: EventFilters, defaults: FilterDefaults): number {
  let n = 0
  if (filters.categories.length && filters.categories.join() !== defaults.categories.join()) n += 1
  if (filters.minPrice !== null || filters.maxPrice !== null) n += 1
  if (filters.when) n += 1
  if (filters.seatMapOnly) n += 1
  if (filters.from || filters.to) n += 1
  return n
}
