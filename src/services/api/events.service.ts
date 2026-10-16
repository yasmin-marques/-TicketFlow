import type {
  Category,
  CategorySlug,
  EventDetail,
  EventFilters,
  EventSummary,
  Paginated,
  Suggestion,
} from '@/types/event'
import { toApiParams } from './eventParams'
import { http } from './http'

export const EVENTS_PAGE_SIZE = 12

/** Serviço de eventos. Cada método corresponde a um endpoint REST. */
export const eventsService = {
  list: (filters: EventFilters, signal?: AbortSignal) =>
    http
      .get<Paginated<EventSummary>>('/events', {
        params: toApiParams(filters, EVENTS_PAGE_SIZE),
        signal,
      })
      .then((r) => r.data),

  featured: (signal?: AbortSignal) =>
    http.get<EventSummary[]>('/events/featured', { signal }).then((r) => r.data),

  upcoming: (city: string, limit: number, category?: CategorySlug, signal?: AbortSignal) =>
    http
      .get<EventSummary[]>('/events/upcoming', { params: { city, limit, category }, signal })
      .then((r) => r.data),

  bySlug: (slug: string, signal?: AbortSignal) =>
    http.get<EventDetail>(`/events/${encodeURIComponent(slug)}`, { signal }).then((r) => r.data),

  related: (slug: string, limit: number, signal?: AbortSignal) =>
    http
      .get<EventSummary[]>(`/events/${encodeURIComponent(slug)}/related`, {
        params: { limit },
        signal,
      })
      .then((r) => r.data),

  suggest: (q: string, signal?: AbortSignal) =>
    http
      .get<Suggestion[]>('/events/suggest', { params: { q, limit: 5 }, signal })
      .then((r) => r.data),
}

export const categoriesService = {
  list: (signal?: AbortSignal) => http.get<Category[]>('/categories', { signal }).then((r) => r.data),
}
