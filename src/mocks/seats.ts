import { parseSeatId } from '@/lib/purchase'
import type { SeatAvailability, SeatState, SeatUpdate } from '@/types/purchase'
import { ALL_SEAT_IDS, getSalesByEventId } from './data/sales'
import { type Db, getDb } from './db'
import { getMockMode } from './mode'

/** "Outras pessoas" simuladas: reservas/vendas voláteis por evento (não persistem). */
const others = new Map<string, Map<string, SeatState>>()

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

const baseCache = new Map<string, Record<string, SeatState>>()

/** Ocupação inicial determinística (mesma fórmula do protótipo): ~27% vendidos, ~9% reservados. */
function baseStates(eventId: string): Record<string, SeatState> {
  const cached = baseCache.get(eventId)
  if (cached) return cached
  const sales = getSalesByEventId(eventId)
  const soldOut = sales?.ticketTypes.every((t) => t.lot.status === 'sold-out' && t.kind === 'seated') ?? false
  const offset = hash(eventId) % 11
  const out: Record<string, SeatState> = {}
  ALL_SEAT_IDS.forEach((id, idx) => {
    const ri = Math.floor(idx / 16)
    const i = idx % 16
    const h = (ri * 13 + i * 7 + offset) % 11
    if (soldOut || h < 3) out[id] = 'sold'
    else if (h === 3) out[id] = 'reserved'
  })
  baseCache.set(eventId, out)
  return out
}

/** Assentos presos em reservas ativas de outros usuários. */
function heldByOthers(db: Db, eventId: string, viewerId: string | null): string[] {
  const now = Date.now()
  return db.reservations
    .filter((r) => r.eventId === eventId && r.status === 'active' && new Date(r.expiresAt).getTime() > now && r.ownerId !== viewerId)
    .flatMap((r) => r.items.flatMap((i) => i.seatIds))
}

/**
 * Disponibilidade vista por `viewerId`: os assentos da reserva dele próprio
 * ficam de fora (aparecem como selecionados na reserva).
 */
export function computeAvailability(eventId: string, viewerId: string | null): SeatAvailability {
  const db = getDb()
  const seats: Record<string, SeatState> = { ...baseStates(eventId) }
  for (const id of db.soldSeats[eventId] ?? []) seats[id] = 'sold'
  for (const [id, state] of others.get(eventId) ?? []) if (seats[id] !== 'sold') seats[id] = state
  for (const id of heldByOthers(db, eventId, viewerId)) if (seats[id] !== 'sold') seats[id] = 'reserved'
  return { eventId, seats, updatedAt: new Date().toISOString() }
}

export function isSeatTaken(eventId: string, seat: string, viewerId: string): boolean {
  return computeAvailability(eventId, viewerId).seats[seat] !== undefined
}

/** Vizinhos livres no mesmo setor, do mais próximo para o mais distante. */
export function suggestNeighbors(eventId: string, seat: string, viewerId: string, exclude: string[] = []): string[] {
  const sales = getSalesByEventId(eventId)
  const layout = sales?.seatMap
  if (!layout) return []
  const { row, number } = parseSeatId(seat)
  const sector = layout.sectors.find((s) => s.rows.includes(row))
  if (!sector) return []
  const taken = computeAvailability(eventId, viewerId).seats
  const candidates = ALL_SEAT_IDS.filter((id) => {
    const p = parseSeatId(id)
    return sector.rows.includes(p.row) && !taken[id] && !exclude.includes(id) && id !== seat
  })
  const dist = (id: string) => {
    const p = parseSeatId(id)
    return Math.abs(p.number - number) + Math.abs(p.row.charCodeAt(0) - row.charCodeAt(0)) * 20
  }
  return candidates.sort((a, b) => dist(a) - dist(b)).slice(0, 2)
}

/** Marca um assento como ocupado por "outra pessoa" (usado ao simular 409). */
export function markTakenByOther(eventId: string, seat: string): void {
  if (!others.has(eventId)) others.set(eventId, new Map())
  others.get(eventId)!.set(seat, 'reserved')
}

/* ── Simulação do fluxo SSE ──────────────────────────────────────────── */

type Listener = (update: SeatUpdate) => void
export type StreamStatus = 'open' | 'error'

/**
 * Equivalente local de `GET /events/{id}/seats/stream` (SSE): de tempos em
 * tempos "outra pessoa" reserva um assento livre e, depois, compra ou desiste.
 */
export function subscribeSeatUpdates(
  eventId: string,
  onUpdate: Listener,
  onStatus: (s: StreamStatus) => void,
): () => void {
  if (getMockMode() === 'erro') {
    const t = window.setTimeout(() => onStatus('error'), 400)
    return () => window.clearTimeout(t)
  }
  const timers = new Set<number>()
  let stopped = false
  const open = window.setTimeout(() => onStatus('open'), 300)
  timers.add(open)

  const emit = (seatId: string, status: SeatUpdate['status']) => {
    if (!stopped) onUpdate({ seatId, status })
  }

  const tick = () => {
    if (stopped) return
    const free = ALL_SEAT_IDS.filter((id) => computeAvailability(eventId, null).seats[id] === undefined)
    const seat = free[Math.floor(Math.random() * free.length)]
    if (seat) {
      markTakenByOther(eventId, seat)
      emit(seat, 'reserved')
      const settle = window.setTimeout(() => {
        const map = others.get(eventId)
        if (!map?.has(seat)) return
        if (Math.random() < 0.5) {
          map.set(seat, 'sold')
          emit(seat, 'sold')
        } else {
          map.delete(seat)
          emit(seat, 'available')
        }
      }, 15_000 + Math.random() * 15_000)
      timers.add(settle)
    }
    timers.add(window.setTimeout(tick, 9_000 + Math.random() * 7_000))
  }
  timers.add(window.setTimeout(tick, 6_000))

  return () => {
    stopped = true
    timers.forEach((t) => window.clearTimeout(t))
  }
}
