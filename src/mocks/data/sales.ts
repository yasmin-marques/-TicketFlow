import { seatId } from '@/lib/purchase'
import type { EventDetail } from '@/types/event'
import type { EventSales, SeatMapLayout, TicketType } from '@/types/purchase'
import { EVENTS } from './events'

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const SEATS_PER_ROW = 16

const round5 = (n: number) => Math.round(n / 5) * 5

function layoutFor(premiumPrice: number, standardPrice: number): SeatMapLayout {
  return {
    rows: ROWS,
    seatsPerRow: SEATS_PER_ROW,
    aisleAfter: 8,
    sectors: [
      { id: 'premium', name: 'Premium', ticketTypeId: 'premium', price: premiumPrice, rows: ['A', 'B', 'C', 'D'] },
      { id: 'standard', name: 'Standard', ticketTypeId: 'standard', price: standardPrice, rows: ['E', 'F', 'G', 'H'] },
    ],
    // Cadeirantes e acompanhantes: pontas das duas últimas filas.
    accessibleSeatIds: ['G01', 'G02', 'G15', 'G16', 'H01', 'H02', 'H15', 'H16'].map((s) => s),
  }
}

const SECTOR_SEATS = 4 * SEATS_PER_ROW

function build(e: EventDetail): EventSales {
  const base = e.minPrice ?? 0
  const soldOut = e.badges.includes('soldOut')
  const open = (name: string, total: number, remaining: number) => ({
    name,
    status: soldOut ? ('sold-out' as const) : ('open' as const),
    total,
    remaining: soldOut ? 0 : remaining,
  })

  const ticketTypes: TicketType[] = []
  let seatMap: SeatMapLayout | null = null

  if (e.hasSeatMap) {
    const standard = base
    const premium = e.slug === 'neon-horizon-festival' ? 120 : round5(base * 1.5)
    seatMap = layoutFor(premium, standard)
    if (e.slug === 'neon-horizon-festival') {
      ticketTypes.push({
        id: 'pista',
        name: 'Pista',
        description: 'Acesso geral · em pé',
        kind: 'general',
        price: 100,
        lot: open('2º lote', 400, 312),
      })
    }
    ticketTypes.push(
      {
        id: 'premium',
        name: 'Premium',
        description: 'Área frontal + open bar · assento marcado',
        kind: 'seated',
        sectorId: 'premium',
        price: premium,
        lot: open('1º lote', SECTOR_SEATS, SECTOR_SEATS),
      },
      {
        id: 'standard',
        name: 'Standard',
        description: 'Visão lateral · assento marcado',
        kind: 'seated',
        sectorId: 'standard',
        price: standard,
        lot: open('1º lote', SECTOR_SEATS, SECTOR_SEATS),
      },
    )
    if (e.slug === 'neon-horizon-festival') {
      ticketTypes.push({
        id: 'camarote',
        name: 'Camarote',
        description: 'Mesa para 4 · serviço exclusivo',
        kind: 'general',
        price: 250,
        lot: { name: '1º lote', status: 'sold-out', total: 40, remaining: 0 },
        nextLotNote: '2º lote abre em 20/10',
      })
    }
  } else if (base === 0) {
    ticketTypes.push({
      id: 'gratuito',
      name: 'Ingresso gratuito',
      description: 'Entrada gratuita mediante inscrição',
      kind: 'general',
      price: 0,
      lot: open('Lote único', 120, 80),
    })
  } else {
    const remaining = e.lot?.remaining ?? 200
    ticketTypes.push(
      {
        id: 'inteira',
        name: 'Inteira',
        description: 'Acesso geral',
        kind: 'general',
        price: base,
        lot: open(e.lot?.name ?? '1º lote', Math.round(remaining * 1.6), remaining),
      },
      {
        id: 'meia',
        name: 'Meia-entrada',
        description: 'Estudantes, idosos e PCD — com comprovação na entrada',
        kind: 'general',
        price: round5(base / 2) || base,
        lot: open(e.lot?.name ?? '1º lote', Math.round(remaining * 0.8), Math.round(remaining / 2)),
      },
    )
  }

  return {
    eventId: e.id,
    slug: e.slug,
    title: e.title,
    startsAt: e.startsAt,
    venueName: e.venue.name,
    city: e.venue.city,
    state: e.venue.state,
    coverUrl: e.coverUrl,
    serviceFeePct: e.serviceFeePct,
    maxPerOrder: 6,
    ticketTypes,
    seatMap,
  }
}

const cache = new Map<string, EventSales>()

export function getSalesByEventId(eventId: string): EventSales | undefined {
  const event = EVENTS.find((e) => e.id === eventId)
  if (!event) return undefined
  let sales = cache.get(eventId)
  if (!sales) {
    sales = build(event)
    cache.set(eventId, sales)
  }
  return sales
}

export function getSalesBySlug(slug: string): EventSales | undefined {
  const event = EVENTS.find((e) => e.slug === slug)
  return event ? getSalesByEventId(event.id) : undefined
}

export const ALL_SEAT_IDS = ROWS.flatMap((r) => Array.from({ length: SEATS_PER_ROW }, (_, i) => seatId(r, i + 1)))
