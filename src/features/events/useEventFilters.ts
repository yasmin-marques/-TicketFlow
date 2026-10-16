import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUserCity } from '@/hooks/useUserCity'
import type { CategorySlug, EventFilters } from '@/types/event'
import { countActiveFilters, parseFilters, serializeFilters, type FilterDefaults } from './filterParams'

/**
 * Filtros da tela de exploração, guardados na querystring (compartilháveis e
 * com botão "voltar" funcional). `category` pré-filtra a rota /categorias/:slug.
 */
export function useEventFilters(category?: CategorySlug) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [userCity] = useUserCity()

  const defaults = useMemo<FilterDefaults>(
    () => ({ city: userCity, categories: category ? [category] : [] }),
    [userCity, category],
  )

  const filters = useMemo(() => parseFilters(searchParams, defaults), [searchParams, defaults])

  /** Aplica um patch; qualquer mudança diferente de `page` volta para a página 1. */
  const update = useCallback(
    (patch: Partial<EventFilters>) => {
      const next: EventFilters = { ...filters, ...patch, page: patch.page ?? 1 }
      setSearchParams(serializeFilters(next, defaults), { replace: patch.page === undefined })
    },
    [filters, defaults, setSearchParams],
  )

  const clear = useCallback(() => {
    // Mantém busca textual e ordenação; zera o resto.
    const next: EventFilters = {
      ...filters,
      city: defaults.city,
      from: '',
      to: '',
      categories: defaults.categories,
      minPrice: null,
      maxPrice: null,
      when: null,
      seatMapOnly: false,
      page: 1,
    }
    setSearchParams(serializeFilters(next, defaults), { replace: true })
  }, [filters, defaults, setSearchParams])

  return {
    filters,
    defaults,
    update,
    clear,
    activeCount: countActiveFilters(filters, defaults),
  }
}
