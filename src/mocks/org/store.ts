import { inDays } from '../data/dates'
import { uid } from '../db'
import type {
  CheckinEntry,
  OrgEvent,
  OrgEventStatus,
  OrgLot,
  OrgNotice,
  OrgOrder,
  OrgSettings,
} from '@/types/organizer'
import { buildSeed, type OrgTicketRec } from './seed'

/**
 * Estado do "backend" do organizador. A base (eventos, lotes, pedidos,
 * ingressos) é gerada de forma determinística a cada carga; o que o
 * organizador altera é guardado em um overlay no localStorage.
 * É só uma simulação: sem concorrência, sem autorização real.
 */
export interface OrgState {
  events: Map<string, StoredEvent>
  lots: Map<string, OrgLot>
  orders: OrgOrder[]
  tickets: OrgTicketRec[]
  log: CheckinEntry[]
  settings: OrgSettings
  notices: OrgNotice[]
  seq: number
}

/** Evento sem os campos derivados (capacidade, vendidos, receita, check-ins). */
export type StoredEvent = Omit<OrgEvent, 'capacity' | 'sold' | 'revenue' | 'checkedIn'>

interface Overlay {
  version: 1
  events: Record<string, StoredEvent>
  lots: Record<string, OrgLot>
  removedLots: string[]
  checkins: Record<string, { at: string; gate: string } | null>
  orderStatus: Record<string, OrgOrder['status']>
  log: CheckinEntry[]
  settings?: OrgSettings
  noticesRead: string[]
  seq: number
}

const KEY = 'tf:mock-org:v1'
let state: OrgState | null = null

function readOverlay(): Overlay | null {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as Overlay) : null
    return parsed?.version === 1 ? parsed : null
  } catch {
    return null
  }
}

export function getOrg(): OrgState {
  if (state) return state
  const seed = buildSeed()
  const s: OrgState = {
    events: new Map(seed.events.map((e) => [e.id, e])),
    lots: new Map(seed.lots.map((l) => [l.id, l])),
    orders: seed.orders,
    tickets: seed.tickets,
    log: [],
    settings: seed.settings,
    notices: seed.notices,
    seq: 1,
  }
  const o = readOverlay()
  if (o) {
    for (const [id, e] of Object.entries(o.events)) s.events.set(id, e)
    for (const [id, l] of Object.entries(o.lots)) s.lots.set(id, l)
    for (const id of o.removedLots) s.lots.delete(id)
    for (const [tid, c] of Object.entries(o.checkins)) {
      const t = s.tickets.find((x) => x.id === tid)
      if (t) {
        t.checkedInAt = c?.at
        t.gate = c?.gate
      }
    }
    for (const [oid, status] of Object.entries(o.orderStatus)) {
      const ord = s.orders.find((x) => x.id === oid)
      if (ord) applyOrderStatus(s, ord, status)
    }
    s.log = o.log
    if (o.settings) s.settings = o.settings
    for (const n of s.notices) n.read = o.noticesRead.includes(n.id)
    s.seq = o.seq
  }
  state = s
  return s
}

/** Muda o status do pedido e cancela/restaura os ingressos correspondentes. */
export function applyOrderStatus(s: OrgState, order: OrgOrder, status: OrgOrder['status']): void {
  order.status = status
  if (status === 'refunded') for (const t of s.tickets) if (t.orderId === order.id) t.status = 'cancelled'
}

/** Salva o overlay: tudo o que difere da base gerada. */
export function saveOrg(extra?: { removedLots?: string[]; orderStatus?: Record<string, OrgOrder['status']> }): void {
  if (!state) return
  const base = buildSeed()
  const baseEvents = new Map(base.events.map((e) => [e.id, JSON.stringify(e)]))
  const baseLots = new Map(base.lots.map((l) => [l.id, JSON.stringify(l)]))
  const events: Overlay['events'] = {}
  for (const [id, e] of state.events) if (baseEvents.get(id) !== JSON.stringify(e)) events[id] = e
  const lots: Overlay['lots'] = {}
  for (const [id, l] of state.lots) if (baseLots.get(id) !== JSON.stringify(l)) lots[id] = l
  const removedLots = [...baseLots.keys()].filter((id) => !state!.lots.has(id))

  const checkins: Overlay['checkins'] = {}
  const baseTickets = new Map(base.tickets.map((t) => [t.id, t]))
  for (const t of state.tickets) {
    const b = baseTickets.get(t.id)
    if (t.checkedInAt !== b?.checkedInAt) checkins[t.id] = t.checkedInAt ? { at: t.checkedInAt, gate: t.gate ?? '' } : null
  }
  const baseOrders = new Map(base.orders.map((o) => [o.id, o.status]))
  const orderStatus: Overlay['orderStatus'] = { ...(extra?.orderStatus ?? {}) }
  for (const o of state.orders) if (baseOrders.get(o.id) !== o.status) orderStatus[o.id] = o.status

  const overlay: Overlay = {
    version: 1,
    events,
    lots,
    removedLots: extra?.removedLots ?? removedLots,
    checkins,
    orderStatus,
    log: state.log.slice(0, 200),
    settings: JSON.stringify(state.settings) === JSON.stringify(base.settings) ? undefined : state.settings,
    noticesRead: state.notices.filter((n) => n.read).map((n) => n.id),
    seq: state.seq,
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(overlay))
  } catch {
    /* sem persistência */
  }
}

/** Apaga as alterações do organizador (volta à base gerada). */
export function resetOrg(): void {
  state = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignora */
  }
}

/* ── Derivados ───────────────────────────────────────────────────────── */

export interface EventStats {
  capacity: number
  sold: number
  revenue: number
  checkedIn: number
}

export function statsFor(s: OrgState, eventId: string): EventStats {
  let capacity = 0
  for (const l of s.lots.values()) if (l.eventId === eventId) capacity += l.quantity
  let sold = 0
  let checkedIn = 0
  for (const t of s.tickets) {
    if (t.eventId !== eventId || t.status !== 'valid') continue
    sold += 1
    if (t.checkedInAt) checkedIn += 1
  }
  let revenue = 0
  for (const o of s.orders) if (o.eventId === eventId && o.status === 'paid') revenue += o.subtotal
  return { capacity, sold, revenue, checkedIn }
}

export function toOrgEvent(s: OrgState, e: StoredEvent): OrgEvent {
  return { ...e, ...statsFor(s, e.id) }
}

export function lotsOf(s: OrgState, eventId: string): OrgLot[] {
  return [...s.lots.values()].filter((l) => l.eventId === eventId)
}

/** Status "vivo" do lote a partir de vendas e janela. */
export function lotStatus(lot: OrgLot, eventStatus: OrgEventStatus): OrgLot['status'] {
  if (eventStatus === 'draft') return 'draft'
  if (lot.sold >= lot.quantity) return 'sold-out'
  const today = inDays(0, '00:00').slice(0, 10)
  if (lot.endsAt < today || eventStatus === 'ended' || eventStatus === 'cancelled') return 'ended'
  return lot.status === 'draft' ? 'draft' : 'published'
}

export function nextId(s: OrgState, prefix: string): string {
  s.seq += 1
  return `${prefix}_n${uid("n").slice(2)}${s.seq}`
}

export type { OrgTicketRec }
