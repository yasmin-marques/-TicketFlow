import { addDays } from '@/lib/date'
import { toDateKey } from '@/lib/format'
import { normalize } from '@/lib/text'
import type {
  Category,
  EventDetail,
  EventFilters,
  EventSort,
  EventSummary,
  Paginated,
  Suggestion,
  WhenFilter,
} from '@/types/event'
import { CATEGORY_DEFS } from './data/categories'
import { CREATED_ORDER, EVENTS, FEATURED_SLUGS } from './data/events'

/**
 * Regras de negócio simuladas do backend (Spring Boot). Cada função
 * corresponde a um endpoint REST — veja `adapter.ts`.
 */

export function toSummary(e: EventDetail): EventSummary {
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    category: e.category,
    startsAt: e.startsAt,
    venue: {
      name: e.venue.name,
      city: e.venue.city,
      state: e.venue.state,
      distanceKm: e.venue.distanceKm,
    },
    minPrice: e.minPrice,
    coverUrl: e.coverUrl,
    badges: e.badges,
    hasSeatMap: e.hasSeatMap,
  }
}

const cityLabel = (e: EventDetail) => `${e.venue.city}, ${e.venue.state}`

function searchHaystack(e: EventDetail): string {
  return normalize(
    [
      e.title,
      e.subtitle,
      e.organizer,
      e.description,
      e.category.name,
      e.venue.name,
      cityLabel(e),
      ...e.schedule.map((s) => s.title),
    ]
      .filter(Boolean)
      .join(' '),
  )
}

function matchesWhen(e: EventDetail, when: WhenFilter, todayKey: string): boolean {
  const key = toDateKey(e.startsAt)
  if (when === 'hoje') return key === todayKey
  if (when === 'mes') return key.slice(0, 7) === todayKey.slice(0, 7)
  // fim de semana: próximo sábado e domingo (ou os de hoje, se já for fim de semana)
  const dow = new Date(`${todayKey}T00:00:00Z`).getUTCDay()
  const toSat = (6 - dow + 7) % 7
  const saturday = dow === 0 ? addDays(todayKey, -1) : addDays(todayKey, toSat)
  return key === saturday || key === addDays(saturday, 1)
}

function compare(sort: EventSort): (a: EventDetail, b: EventDetail) => number {
  const byDate = (a: EventDetail, b: EventDetail) => a.startsAt.localeCompare(b.startsAt)
  switch (sort) {
    case 'recentes':
      return (a, b) => (CREATED_ORDER[b.id] ?? 0) - (CREATED_ORDER[a.id] ?? 0)
    case 'preco':
      return (a, b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity) || byDate(a, b)
    case 'distancia':
      return (a, b) =>
        (a.venue.distanceKm ?? Infinity) - (b.venue.distanceKm ?? Infinity) || byDate(a, b)
    default:
      return byDate
  }
}

export function listEvents(
  filters: EventFilters,
  pageSize: number,
): Paginated<EventSummary> {
  const todayKey = toDateKey(new Date().toISOString())
  const q = normalize(filters.q)
  const terms = q ? q.split(/\s+/) : []

  const filtered = EVENTS.filter((e) => {
    const key = toDateKey(e.startsAt)
    if (key < todayKey) return false // evento já passou
    if (terms.length) {
      const hay = searchHaystack(e)
      if (!terms.every((t) => hay.includes(t))) return false
    }
    if (filters.city && cityLabel(e) !== filters.city) return false
    if (filters.from && key < filters.from) return false
    if (filters.to && key > filters.to) return false
    if (filters.categories.length && !filters.categories.includes(e.category.slug)) return false
    if (filters.minPrice !== null && (e.minPrice ?? 0) < filters.minPrice) return false
    if (filters.maxPrice !== null && (e.minPrice ?? 0) > filters.maxPrice) return false
    if (filters.when && !matchesWhen(e, filters.when, todayKey)) return false
    if (filters.seatMapOnly && !e.hasSeatMap) return false
    return true
  }).sort(compare(filters.sort))

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(Math.max(1, filters.page), totalPages)
  const start = (page - 1) * pageSize
  return {
    items: filtered.slice(start, start + pageSize).map(toSummary),
    total: filtered.length,
    page,
    pageSize,
    totalPages,
  }
}

export function getEventBySlug(slug: string): EventDetail | undefined {
  return EVENTS.find((e) => e.slug === slug)
}

export function listFeatured(): EventSummary[] {
  return FEATURED_SLUGS.map((slug) => getEventBySlug(slug)).flatMap((e) => (e ? [toSummary(e)] : []))
}

export function listUpcoming(city: string, limit: number, category?: string): EventSummary[] {
  const todayKey = toDateKey(new Date().toISOString())
  return EVENTS.filter(
    (e) =>
      toDateKey(e.startsAt) >= todayKey &&
      (!city || cityLabel(e) === city) &&
      (!category || e.category.slug === category),
  )
    .sort(compare('data'))
    .slice(0, limit)
    .map(toSummary)
}

export function listRelated(slug: string, limit: number): EventSummary[] {
  const current = getEventBySlug(slug)
  if (!current) return []
  const todayKey = toDateKey(new Date().toISOString())
  const others = EVENTS.filter((e) => e.slug !== slug && toDateKey(e.startsAt) >= todayKey)
  const sameCategory = others.filter((e) => e.category.slug === current.category.slug)
  const rest = others.filter((e) => e.category.slug !== current.category.slug)
  return [...sameCategory.sort(compare('data')), ...rest.sort(compare('data'))]
    .slice(0, limit)
    .map(toSummary)
}

export function listCategories(): Category[] {
  const todayKey = toDateKey(new Date().toISOString())
  return CATEGORY_DEFS.map((c) => ({
    ...c,
    eventCount: EVENTS.filter(
      (e) => e.category.slug === c.slug && toDateKey(e.startsAt) >= todayKey,
    ).length,
  }))
}

export function suggest(query: string, limit: number): Suggestion[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  return EVENTS.filter((e) => {
    const hay = searchHaystack(e)
    return terms.every((t) => hay.includes(t))
  })
    .slice(0, limit)
    .map((e) => ({
      slug: e.slug,
      title: e.title,
      category: e.category.name,
      venue: `${e.venue.name}, ${e.venue.city}`,
    }))
}
