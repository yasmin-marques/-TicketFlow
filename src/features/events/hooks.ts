import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { categoriesService, eventsService } from '@/services/api/events.service'
import type { CategorySlug, EventFilters } from '@/types/event'

export const eventKeys = {
  all: ['events'] as const,
  list: (filters: EventFilters) => [...eventKeys.all, 'list', filters] as const,
  featured: () => [...eventKeys.all, 'featured'] as const,
  upcoming: (city: string, limit: number, category?: CategorySlug) =>
    [...eventKeys.all, 'upcoming', city, limit, category ?? null] as const,
  detail: (slug: string) => [...eventKeys.all, 'detail', slug] as const,
  related: (slug: string, limit: number) => [...eventKeys.all, 'related', slug, limit] as const,
  suggest: (q: string) => [...eventKeys.all, 'suggest', q] as const,
  categories: () => ['categories'] as const,
}

/** Catálogo paginado. Mantém a página anterior visível durante a troca de filtros. */
export function useEventList(filters: EventFilters, enabled = true) {
  return useQuery({
    queryKey: eventKeys.list(filters),
    queryFn: ({ signal }) => eventsService.list(filters, signal),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useFeaturedEvents() {
  return useQuery({
    queryKey: eventKeys.featured(),
    queryFn: ({ signal }) => eventsService.featured(signal),
  })
}

export function useUpcomingEvents(city: string, limit = 5, category?: CategorySlug) {
  return useQuery({
    queryKey: eventKeys.upcoming(city, limit, category),
    queryFn: ({ signal }) => eventsService.upcoming(city, limit, category, signal),
    placeholderData: keepPreviousData,
  })
}

export function useEvent(slug: string) {
  return useQuery({
    queryKey: eventKeys.detail(slug),
    queryFn: ({ signal }) => eventsService.bySlug(slug, signal),
  })
}

export function useRelatedEvents(slug: string, limit = 3) {
  return useQuery({
    queryKey: eventKeys.related(slug, limit),
    queryFn: ({ signal }) => eventsService.related(slug, limit, signal),
  })
}

export function useEventSuggestions(q: string) {
  return useQuery({
    queryKey: eventKeys.suggest(q),
    queryFn: ({ signal }) => eventsService.suggest(q, signal),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
  })
}

export function useCategories() {
  return useQuery({
    queryKey: eventKeys.categories(),
    queryFn: ({ signal }) => categoriesService.list(signal),
    staleTime: 5 * 60_000,
  })
}
