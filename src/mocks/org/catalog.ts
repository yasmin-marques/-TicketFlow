import { addHours } from '../data/dates'
import { EVENTS, slugify } from '../data/events'
import type { EventDetail } from '@/types/event'
import { CATEGORY_DEFS } from '../data/categories'
import { SEEDED_EVENT_IDS } from './seed'
import { lotsOf, type OrgState, type StoredEvent } from './store'

/**
 * Integração mock: eventos CRIADOS no painel e publicados aparecem no catálogo
 * público (Explorar/Evento/Compra). Eventos semeados do painel já existem no
 * catálogo com o mesmo slug, então não são duplicados. Mapa de assentos
 * personalizado não é usado pela jornada do comprador (planta única do mock).
 */
const published = new Set<string>()

export function publishToCatalog(s: OrgState, ev: StoredEvent): void {
  // Semeados já estão no catálogo. (Não usar prefixo: `oevt_neon` também começa com `oevt_n`, como os ids novos.)
  if (SEEDED_EVENT_IDS.has(ev.id)) return
  const lots = lotsOf(s, ev.id)
  const minPrice = lots.length ? Math.min(...lots.map((l) => l.price)) : null
  const category = CATEGORY_DEFS.find((c) => c.slug === ev.category) ?? CATEGORY_DEFS[0]!
  const detail: EventDetail = {
    id: `evt_org_${ev.id}`,
    slug: ev.slug || slugify(ev.title),
    title: ev.title,
    category: { slug: category.slug, name: category.name },
    startsAt: ev.startsAt,
    endsAt: ev.endsAt,
    venue: { name: ev.venue.name, city: ev.venue.city || 'São Paulo', state: ev.venue.state || 'SP', distanceKm: null, address: ev.venue.address || undefined, district: ev.venue.district || undefined, notes: ev.venue.notes || undefined },
    minPrice,
    coverUrl: null,
    badges: [],
    hasSeatMap: false,
    organizer: 'Pulse Produções',
    description: ev.description,
    ageRating: ev.ageRating,
    schedule: [{ time: ev.startsAt.slice(11, 16), title: 'Abertura dos portões' }, { time: addHours(ev.startsAt, 1).slice(11, 16), title: 'Início da programação' }],
    cancellationPolicy:
      ev.cancellationPolicy === 'full-7d'
        ? [{ title: 'Reembolso integral até 7 dias após a compra', body: 'Você pode cancelar a compra em até 7 dias e receber o valor integral, desde que faltem mais de 48 horas para o evento.' }]
        : [],
    serviceFeePct: 10,
    lot: lots[0] ? { name: lots[0].name, remaining: Math.max(0, lots[0].quantity - lots[0].sold) } : undefined,
  }
  const i = EVENTS.findIndex((e) => e.id === detail.id)
  if (i >= 0) EVENTS[i] = detail
  else EVENTS.push(detail)
  published.add(detail.id)
}

export function removeFromCatalog(ev: StoredEvent): void {
  const id = `evt_org_${ev.id}`
  const i = EVENTS.findIndex((e) => e.id === id)
  if (i >= 0) EVENTS.splice(i, 1)
  published.delete(id)
}

/** Reaplica ao catálogo os eventos criados e publicados em sessões anteriores. */
export function syncCatalogFromOrg(s: OrgState): void {
  for (const ev of s.events.values()) if (ev.status === 'published') publishToCatalog(s, ev)
}
