import { parseEventFilters } from '@/services/api/eventParams'
import type { EventSales } from '@/types/purchase'
import type { AddRoute } from '../adapter'
import { getSalesBySlug } from '../data/sales'
import { HttpError, Created } from '../httpError'
import { computeAvailability } from '../seats'
import {
  getEventBySlug,
  listCategories,
  listEvents,
  listFeatured,
  listRelated,
  listUpcoming,
  suggest,
} from '../server'
import { EVENTS } from '../data/events'

const num = (v: unknown, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) && v !== '' && v !== undefined ? n : fallback
}

/** Catálogo público: eventos, categorias, venda (lotes) e disponibilidade de assentos. */
export function registerEventRoutes(add: AddRoute): void {
  add('GET', '/events', ({ query, mode }) => {
    const pageSize = num(query.pageSize, 12)
    if (mode === 'vazio') return { items: [], total: 0, page: 1, pageSize, totalPages: 1 }
    return listEvents(parseEventFilters(query), pageSize)
  })

  add('GET', '/events/featured', ({ mode }) => (mode === 'vazio' ? [] : listFeatured()))

  add('GET', '/events/upcoming', ({ query, mode }) =>
    mode === 'vazio'
      ? []
      : listUpcoming(String(query.city ?? ''), num(query.limit, 5), query.category ? String(query.category) : undefined),
  )

  add('GET', '/events/suggest', ({ query }) => suggest(String(query.q ?? ''), num(query.limit, 5)))
  add('GET', '/categories', () => listCategories())

  add('GET', '/events/:slug/related', ({ params, query }) => listRelated(params.slug!, num(query.limit, 3)))

  /** Lotes e tipos de ingresso; `remaining` dos setores reflete o mapa em tempo real. */
  add('GET', '/events/:slug/sales', ({ params, user }) => {
    const sales = getSalesBySlug(params.slug!)
    if (!sales) throw new HttpError(404, 'NOT_FOUND', 'Evento não encontrado')
    const taken = computeAvailability(sales.eventId, user?.id ?? null).seats
    const withStock: EventSales = {
      ...sales,
      ticketTypes: sales.ticketTypes.map((t) => {
        if (t.kind !== 'seated' || !sales.seatMap) return t
        const sector = sales.seatMap.sectors.find((s) => s.id === t.sectorId)
        const free = sector
          ? sector.rows.flatMap((r) => Array.from({ length: 16 }, (_, i) => `${r}${String(i + 1).padStart(2, '0')}`)).filter((id) => !taken[id]).length
          : 0
        return { ...t, lot: { ...t.lot, remaining: t.lot.status === 'sold-out' ? 0 : free, status: free === 0 ? ('sold-out' as const) : t.lot.status } }
      }),
    }
    return withStock
  })

  add('GET', '/events/:eventId/seats', ({ params, user }) => {
    if (!EVENTS.some((e) => e.id === params.eventId)) throw new HttpError(404, 'NOT_FOUND', 'Evento não encontrado')
    return computeAvailability(params.eventId!, user?.id ?? null)
  })

  /** "Avise-me" de um lote esgotado. */
  add(
    'POST',
    '/events/:eventId/ticket-types/:typeId/waitlist',
    ({ params, db, user }) => {
      const key = `${user!.id}:${params.eventId}:${params.typeId}`
      if (!db.waitlist.includes(key)) db.waitlist.push(key)
      return new Created({ subscribed: true })
    },
    { auth: true },
  )

  // Registrada por último: `/events/:slug` casaria com as rotas fixas acima.
  add('GET', '/events/:slug', ({ params }) => {
    const event = getEventBySlug(params.slug!)
    if (!event) throw new HttpError(404, 'NOT_FOUND', 'Evento não encontrado')
    return event
  })
}
