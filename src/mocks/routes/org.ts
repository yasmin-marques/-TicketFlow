import { isValidCpf } from '@/lib/validation'
import type { CategorySlug } from '@/types/event'
import type {
  AttendeeStatus,
  CheckinEntry,
  CheckinResult,
  CheckinStats,
  Kpi,
  OrgAttendee,
  OrgDashboard,
  OrgEventInput,
  OrgEventStatus,
  OrgEventSummary,
  OrgLot,
  OrgLotInput,
  OrgOrder,
  OrgPage,
  OrgReport,
  OrgSeatMap,
  OrgSettings,
} from '@/types/organizer'
import type { AddRoute, RouteCtx } from '../adapter'
import { EVENTS } from '../data/events'
import { getDb, type DbUser } from '../db'
import { Created, HttpError } from '../httpError'
import {
  applyOrderStatus,
  getOrg,
  lotStatus,
  lotsOf,
  nextId,
  saveOrg,
  statsFor,
  toOrgEvent,
  type OrgState,
  type StoredEvent,
} from '../org/store'
import { publishToCatalog, removeFromCatalog } from '../org/catalog'

const DAY = 86_400_000
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && v !== '' && v !== undefined ? Number(v) : d)
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v))
const dayKey = (iso: string | number) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

function requireOrganizer(user: DbUser | null): void {
  if (!user || (user.role !== 'ORGANIZER' && user.role !== 'ADMIN')) {
    throw new HttpError(403, 'FORBIDDEN', 'Você não tem acesso ao painel do organizador')
  }
}

const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function paginate<T>(items: T[], page: number, pageSize: number): OrgPage<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const p = Math.min(Math.max(1, page), totalPages)
  return { items: items.slice((p - 1) * pageSize, p * pageSize), total: items.length, page: p, pageSize, totalPages }
}

function summary(s: OrgState, e: StoredEvent): OrgEventSummary {
  const st = statsFor(s, e.id)
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    venueLabel: `${e.venue.name || 'Local a definir'}${e.venue.city ? ` · ${e.venue.city}` : ''}`,
    startsAt: e.startsAt,
    status: e.status,
    sold: st.sold,
    capacity: st.capacity,
    revenue: st.revenue,
  }
}

function getEvent(s: OrgState, id: string): StoredEvent {
  const e = s.events.get(id)
  if (!e) throw new HttpError(404, 'NOT_FOUND', 'Evento não encontrado')
  return e
}

function seatMapCapacity(m: OrgSeatMap | null): number {
  if (!m) return 0
  return m.rows.reduce((n, r) => n + r.cells.filter((c) => c && !c.blocked).length, 0) + m.generalCapacity
}

/** Erros que impedem a publicação (a regra definitiva é do backend). */
function publishErrors(s: OrgState, e: StoredEvent): string[] {
  const errors: string[] = []
  if (e.title.trim().length < 3) errors.push('Informe o nome do evento')
  if (e.description.trim().length < 80) errors.push('A descrição precisa ter ao menos 80 caracteres')
  if (!e.venue.name.trim()) errors.push('Informe o local do evento')
  if (new Date(e.endsAt) <= new Date(e.startsAt)) errors.push('O término precisa ser depois do início')
  if (lotsOf(s, e.id).length === 0) errors.push('Crie ao menos um lote de ingressos')
  if (e.hasSeatMap && seatMapCapacity(e.seatMap) === 0) errors.push('O mapa de assentos está vazio')
  return errors
}

function validateInput(input: Partial<OrgEventInput>): void {
  if (input.title !== undefined && input.title.trim().length < 3) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'O nome precisa ter ao menos 3 caracteres')
  }
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'O término precisa ser depois do início')
  }
}

function slugTaken(s: OrgState, slug: string, exceptId?: string): boolean {
  if ([...s.events.values()].some((e) => e.slug === slug && e.id !== exceptId)) return true
  // Também não pode colidir com o catálogo público.
  return EVENTS.some((e) => e.slug === slug && !(exceptId && s.events.get(exceptId)?.slug === slug))
}

const DEFAULT_VENUE = { name: '', address: '', district: '', city: '', state: '', notes: '' }

function validateLot(input: Partial<OrgLotInput>, full: boolean): void {
  if (full && (!input.typeName?.trim() || !input.name?.trim())) throw new HttpError(422, 'VALIDATION_ERROR', 'Informe o tipo e o nome do lote')
  if (input.price !== undefined && (!(input.price >= 0) || input.price > 100000)) throw new HttpError(422, 'VALIDATION_ERROR', 'Preço inválido')
  if (input.quantity !== undefined && (!Number.isInteger(input.quantity) || input.quantity < 1)) throw new HttpError(422, 'VALIDATION_ERROR', 'Quantidade inválida')
  if (input.startsAt && input.endsAt && input.endsAt < input.startsAt) throw new HttpError(422, 'VALIDATION_ERROR', 'O encerramento precisa ser depois do início')
  if (input.perCustomerLimit !== undefined && (!Number.isInteger(input.perCustomerLimit) || input.perCustomerLimit < 1 || input.perCustomerLimit > 20)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Limite por cliente inválido')
  }
}

/* ── Dashboard ───────────────────────────────────────────────────────── */

function pct(curr: number, prev: number): number | null {
  return prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : null
}

function dashboard(s: OrgState, range: 7 | 30 | 90, eventId: string | null): OrgDashboard {
  const now = Date.now()
  const from = now - range * DAY
  const prevFrom = from - range * DAY
  const inScope = (eid: string) => !eventId || eid === eventId
  const orders = s.orders.filter((o) => inScope(o.eventId) && o.status === 'paid')
  const cur = orders.filter((o) => new Date(o.createdAt).getTime() >= from)
  const prev = orders.filter((o) => {
    const t = new Date(o.createdAt).getTime()
    return t >= prevFrom && t < from
  })
  const sum = (xs: OrgOrder[], f: (o: OrgOrder) => number) => xs.reduce((n, o) => n + f(o), 0)

  const scopeEvents = [...s.events.values()].filter((e) => inScope(e.id) && (e.status === 'published' || e.status === 'ended'))
  const capacity = scopeEvents.reduce((n, e) => n + statsFor(s, e.id).capacity, 0)
  const soldAll = scopeEvents.reduce((n, e) => n + statsFor(s, e.id).sold, 0)
  const soldInWindow = sum(cur, (o) => o.quantity)
  const occNow = capacity ? (soldAll / capacity) * 100 : 0
  const occThen = capacity ? ((soldAll - soldInWindow) / capacity) * 100 : 0
  const checked = scopeEvents.reduce((n, e) => n + statsFor(s, e.id).checkedIn, 0)

  const salesByDay: OrgDashboard['salesByDay'] = []
  for (let i = range - 1; i >= 0; i--) salesByDay.push({ date: dayKey(now - i * DAY), tickets: 0 })
  const idx = new Map(salesByDay.map((d, i) => [d.date, i]))
  for (const o of cur) {
    const i = idx.get(dayKey(o.createdAt))
    if (i !== undefined) salesByDay[i]!.tickets += o.quantity
  }

  const byTypeMap = new Map<string, number>()
  for (const o of cur) for (const l of o.lines) {
    const type = l.description.split(' · ')[0] ?? l.description
    byTypeMap.set(type, (byTypeMap.get(type) ?? 0) + l.quantity)
  }
  const byType = [...byTypeMap.entries()].map(([name, tickets]) => ({ name, tickets })).sort((a, b) => b.tickets - a.tickets)
  const top = byType.slice(0, 4)
  const rest = byType.slice(4).reduce((n, t) => n + t.tickets, 0)
  if (rest) top.push({ name: 'Outros', tickets: rest })

  // Acumulado: 12 pontos ao longo da janela.
  const cumulative: OrgDashboard['cumulative'] = []
  let base = soldAll - soldInWindow
  const step = Math.max(1, Math.floor(range / 11))
  let acc = base
  for (let i = 0; i < salesByDay.length; i++) {
    acc += salesByDay[i]!.tickets
    if (i % step === 0 || i === salesByDay.length - 1) cumulative.push({ date: salesByDay[i]!.date, tickets: acc })
  }
  base = 0

  const revenueByEvent = scopeEvents
    .map((e) => ({ eventId: e.id, title: e.title, revenue: statsFor(s, e.id).revenue }))
    .filter((e) => e.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  const order: Record<OrgEventStatus, number> = { published: 0, draft: 1, ended: 2, cancelled: 3 }
  const activeEvents = [...s.events.values()]
    .filter((e) => inScope(e.id) && e.status !== 'cancelled')
    .sort((a, b) => order[a.status] - order[b.status] || a.startsAt.localeCompare(b.startsAt))
    .slice(0, 8)
    .map((e) => summary(s, e))

  const kpi = (value: number, delta: number | null): Kpi => ({ value, delta })
  return {
    range,
    eventId,
    updatedAt: new Date().toISOString(),
    revenue: kpi(Math.round(sum(cur, (o) => o.subtotal)), pct(sum(cur, (o) => o.subtotal), sum(prev, (o) => o.subtotal))),
    sold: kpi(soldInWindow, pct(soldInWindow, sum(prev, (o) => o.quantity))),
    occupancy: kpi(Math.round(occNow), Math.round((occNow - occThen) * 10) / 10),
    checkins: { value: checked, pctOfSold: soldAll ? Math.round((checked / soldAll) * 100) : 0 },
    salesByDay,
    byType: top,
    cumulative,
    goal: capacity,
    revenueByEvent,
    activeEvents,
  }
}

/* ── Participantes ───────────────────────────────────────────────────── */

function attendeeStatus(t: OrgState['tickets'][number]): AttendeeStatus {
  if (t.status === 'cancelled') return 'cancelled'
  return t.checkedInAt ? 'checked-in' : 'waiting'
}

function toAttendee(t: OrgState['tickets'][number]): OrgAttendee {
  return {
    ticketId: t.id,
    code: t.code,
    name: t.name,
    email: t.email,
    eventId: t.eventId,
    orderCode: t.orderCode,
    typeName: t.typeName,
    sector: t.sector,
    seat: t.seat,
    status: attendeeStatus(t),
    checkedInAt: t.checkedInAt,
    gate: t.gate,
  }
}

/* ── Check-in ────────────────────────────────────────────────────────── */

function parseCode(raw: string): string {
  const v = raw.trim().toUpperCase()
  // Conteúdo do QR: TF1.<ticketId>.<código>
  if (v.startsWith('TF1.')) return v.split('.').slice(2).join('.')
  return v
}

function logEntry(s: OrgState, entry: Omit<CheckinEntry, 'id'>): void {
  s.log.unshift({ id: nextId(s, 'chk'), ...entry })
  s.log = s.log.slice(0, 200)
}

function performCheckin(s: OrgState, ev: StoredEvent, rawCode: string, gate: string): CheckinResult {
  const code = parseCode(rawCode)
  const at = new Date().toISOString()
  const finish = (r: CheckinResult): CheckinResult => {
    logEntry(s, { at, result: r.result, code, holderName: r.holderName, gate })
    return r
  }

  const t = s.tickets.find((x) => x.code === code)
  if (t) {
    if (t.eventId !== ev.id) return finish({ result: 'invalid', code, message: 'Ingresso de outro evento' })
    if (t.status === 'cancelled') return finish({ result: 'invalid', code, message: 'Ingresso cancelado ou reembolsado', holderName: t.name })
    if (t.checkedInAt) {
      return finish({ result: 'used', code, message: 'Ingresso já utilizado', holderName: t.name, typeName: t.typeName, sector: t.sector, seat: t.seat, checkedInAt: t.checkedInAt, gate: t.gate })
    }
    t.checkedInAt = at
    t.gate = gate
    return finish({ result: 'valid', code, message: 'Entrada autorizada', holderName: t.name, typeName: t.typeName, sector: t.sector, seat: t.seat })
  }

  // Ingressos comprados pelo fluxo do comprador (Parte 2) para o mesmo evento do catálogo.
  const customer = getDb().tickets.find((x) => x.code === code && x.eventSlug === ev.slug)
  if (customer) {
    if (customer.status === 'cancelled') return finish({ result: 'invalid', code, message: 'Ingresso cancelado ou reembolsado', holderName: customer.holderName })
    if (customer.status === 'used') {
      return finish({ result: 'used', code, message: 'Ingresso já utilizado', holderName: customer.holderName, typeName: customer.typeName, sector: customer.sectorName ?? customer.typeName, seat: customer.seatId ?? null, checkedInAt: customer.usedAt })
    }
    customer.status = 'used'
    customer.usedAt = at
    return finish({ result: 'valid', code, message: 'Entrada autorizada', holderName: customer.holderName, typeName: customer.typeName, sector: customer.sectorName ?? customer.typeName, seat: customer.seatId ?? null })
  }

  return finish({ result: 'invalid', code, message: 'Ingresso inválido ou de outro evento' })
}

/* ── Rotas ───────────────────────────────────────────────────────────── */

type Ctx = RouteCtx

/**
 * Painel do organizador SIMULADO. Papel (`ORGANIZER`) é verificado aqui só para
 * demonstrar o contrato (403); a autorização real e a decisão de check-in/
 * emissão de ingressos pertencem ao backend. Nenhuma validação criptográfica
 * é feita no frontend.
 */
export function registerOrgRoutes(add: AddRoute): void {
  const route = (method: string, path: string, handler: (ctx: Ctx, s: OrgState) => unknown) =>
    add(
      method,
      path,
      (ctx) => {
        requireOrganizer(ctx.user)
        const s = getOrg()
        const result = handler(ctx, s)
        return result
      },
      { auth: true },
    )
  const persist = () => saveOrg()

  /* Dashboard e relatórios */
  route('GET', '/org/dashboard', ({ query }, s) => {
    const range = ([7, 30, 90] as const).find((r) => r === num(query.range, 30)) ?? 30
    return dashboard(s, range, str(query.eventId) || null)
  })

  route('GET', '/org/reports', ({ query }, s) => {
    const published = [...s.events.values()].filter((e) => e.status === 'published' || e.status === 'ended')
    const ev = s.events.get(str(query.eventId)) ?? published[0]
    if (!ev) throw new HttpError(404, 'NOT_FOUND', 'Nenhum evento para o relatório')
    const now = Date.now()
    const from = str(query.from) || dayKey(now - 45 * DAY)
    const to = str(query.to) || dayKey(now)
    const orders = s.orders.filter((o) => o.eventId === ev.id && o.status === 'paid' && dayKey(o.createdAt) >= from && dayKey(o.createdAt) <= to)
    const st = statsFor(s, ev.id)
    const revenue = orders.reduce((n, o) => n + o.subtotal, 0)
    const sold = orders.reduce((n, o) => n + o.quantity, 0)

    const days: OrgReport['dailyRevenue'] = []
    for (let t = new Date(`${from}T12:00:00Z`).getTime(); t <= new Date(`${to}T12:00:00Z`).getTime() && days.length < 400; t += DAY) {
      days.push({ date: dayKey(t), revenue: 0 })
    }
    const idx = new Map(days.map((d, i) => [d.date, i]))
    for (const o of orders) {
      const i = idx.get(dayKey(o.createdAt))
      if (i !== undefined) days[i]!.revenue += o.subtotal
    }

    // Funil e conversão: vêm de analytics de visitas (não existem aqui) — derivados e marcados como simulados.
    let h = 0
    for (const ch of ev.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    const conv = 3.5 + (h % 25) / 10
    const paidOrders = Math.max(1, orders.length)
    const checkout = Math.round(paidOrders / 0.65)
    const choose = Math.round(checkout / 0.44)
    const visits = Math.round(paidOrders / (conv / 100))

    const lots = lotsOf(s, ev.id)
    const bySector: OrgReport['bySector'] = []
    const byType = new Map<string, { sold: number; total: number }>()
    for (const l of lots) {
      const cur = byType.get(l.typeName) ?? { sold: 0, total: 0 }
      cur.sold += l.sold
      cur.total += l.quantity
      byType.set(l.typeName, cur)
    }
    for (const [name, v] of byType) bySector.push({ name, pct: v.total ? Math.round((v.sold / v.total) * 100) : 0 })

    const report: OrgReport = {
      eventId: ev.id,
      from,
      to,
      revenue: Math.round(revenue),
      sold,
      occupancyPct: st.capacity ? Math.round((st.sold / st.capacity) * 100) : 0,
      avgTicket: sold ? Math.round((revenue / sold) * 100) / 100 : 0,
      checkins: st.checkedIn,
      checkinPct: st.sold ? Math.round((st.checkedIn / st.sold) * 100) : 0,
      conversionPct: Math.round(conv * 10) / 10,
      expiredReservationsPct: 6 + (h % 70) / 10,
      dailyRevenue: days,
      funnel: [
        { label: 'Visitas à página', value: visits },
        { label: 'Escolheu ingresso', value: choose },
        { label: 'Checkout', value: checkout },
        { label: 'Pago', value: paidOrders },
      ],
      byLot: lots.map((l) => ({ typeName: l.typeName, lotName: l.name, sold: l.sold, total: l.quantity })),
      bySector,
    }
    return report
  })

  /* Eventos */
  route('GET', '/org/events', ({ query }, s) => {
    const q = str(query.q).toLowerCase()
    const status = str(query.status)
    const all = [...s.events.values()]
    const counts = { all: all.length, draft: 0, published: 0, ended: 0, cancelled: 0 } as Record<OrgEventStatus | 'all', number>
    for (const e of all) counts[e.status] += 1
    const items = all
      .filter((e) => (!status || e.status === status) && (!q || e.title.toLowerCase().includes(q)))
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      .map((e) => summary(s, e))
    return { items, total: items.length, counts }
  })

  route('GET', '/org/events/slug-available', ({ query }, s) => {
    const slug = slugify(str(query.slug))
    return { slug, available: slug.length > 0 && !slugTaken(s, slug, str(query.exceptId) || undefined) }
  })

  route('POST', '/org/events', ({ body }, s) => {
    const input = body as Partial<OrgEventInput>
    validateInput(input)
    const title = str(input.title).trim()
    let slug = slugify(str(input.slug) || title)
    if (slug && slugTaken(s, slug)) slug = `${slug}-${s.seq + 1}`
    const startsAt = input.startsAt || new Date(Date.now() + 30 * DAY).toISOString()
    const ev: StoredEvent = {
      id: nextId(s, 'oevt'),
      slug,
      title,
      category: (input.category as CategorySlug) ?? 'musica',
      ageRating: input.ageRating ?? 0,
      description: str(input.description),
      startsAt,
      endsAt: input.endsAt || new Date(new Date(startsAt).getTime() + 4 * 3_600_000).toISOString(),
      venue: { ...DEFAULT_VENUE, ...(input.venue ?? {}) },
      coverName: input.coverName ?? null,
      hasSeatMap: !!input.hasSeatMap,
      seatMap: input.seatMap ?? null,
      cancellationPolicy: input.cancellationPolicy ?? 'full-7d',
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    s.events.set(ev.id, ev)
    persist()
    return new Created(toOrgEvent(s, ev))
  })

  route('GET', '/org/events/:id', ({ params }, s) => toOrgEvent(s, getEvent(s, params.id!)))

  route('PATCH', '/org/events/:id', ({ params, body }, s) => {
    const ev = getEvent(s, params.id!)
    if (ev.status === 'cancelled' || ev.status === 'ended') throw new HttpError(409, 'INVALID_STATE', 'Eventos encerrados ou cancelados não podem ser editados')
    const input = body as Partial<OrgEventInput>
    validateInput({ ...ev, ...input })
    if (input.slug !== undefined) {
      const slug = slugify(input.slug)
      if (!slug) throw new HttpError(422, 'VALIDATION_ERROR', 'Link inválido')
      if (slugTaken(s, slug, ev.id)) throw new HttpError(409, 'SLUG_TAKEN', 'Este link já está em uso')
      if (ev.status === 'published' && slug !== ev.slug && statsFor(s, ev.id).sold > 0) {
        throw new HttpError(409, 'INVALID_STATE', 'O link de um evento com vendas não pode mudar')
      }
      ev.slug = slug
    }
    const { slug: _slug, ...rest } = input
    Object.assign(ev, rest, { venue: { ...ev.venue, ...(input.venue ?? {}) }, updatedAt: new Date().toISOString() })
    if (ev.status === 'published') publishToCatalog(s, ev)
    persist()
    return toOrgEvent(s, ev)
  })

  route('POST', '/org/events/:id/publish', ({ params }, s) => {
    const ev = getEvent(s, params.id!)
    if (ev.status !== 'draft') throw new HttpError(409, 'INVALID_STATE', 'Só rascunhos podem ser publicados')
    const errors = publishErrors(s, ev)
    if (errors.length) throw new HttpError(422, 'PUBLISH_BLOCKED', 'O evento ainda não pode ser publicado', { errors })
    ev.status = 'published'
    ev.updatedAt = new Date().toISOString()
    for (const l of lotsOf(s, ev.id)) l.status = 'published'
    publishToCatalog(s, ev)
    persist()
    return toOrgEvent(s, ev)
  })

  route('POST', '/org/events/:id/unpublish', ({ params }, s) => {
    const ev = getEvent(s, params.id!)
    if (ev.status !== 'published') throw new HttpError(409, 'INVALID_STATE', 'O evento não está publicado')
    if (statsFor(s, ev.id).sold > 0) throw new HttpError(409, 'INVALID_STATE', 'Eventos com vendas não podem voltar para rascunho — cancele o evento')
    ev.status = 'draft'
    ev.updatedAt = new Date().toISOString()
    removeFromCatalog(ev)
    persist()
    return toOrgEvent(s, ev)
  })

  route('POST', '/org/events/:id/cancel', ({ params }, s) => {
    const ev = getEvent(s, params.id!)
    if (ev.status === 'cancelled' || ev.status === 'ended') throw new HttpError(409, 'INVALID_STATE', 'O evento já foi encerrado')
    ev.status = 'cancelled'
    ev.updatedAt = new Date().toISOString()
    // Cancelar o evento reembolsa todos os pedidos pagos.
    for (const o of s.orders) if (o.eventId === ev.id && o.status === 'paid') applyOrderStatus(s, o, 'refunded')
    removeFromCatalog(ev)
    persist()
    return toOrgEvent(s, ev)
  })

  route('DELETE', '/org/events/:id', ({ params }, s) => {
    const ev = getEvent(s, params.id!)
    if (ev.status !== 'draft' || statsFor(s, ev.id).sold > 0) throw new HttpError(409, 'INVALID_STATE', 'Só rascunhos sem vendas podem ser excluídos')
    s.events.delete(ev.id)
    const removedLots = lotsOf(s, ev.id).map((l) => l.id)
    for (const id of removedLots) s.lots.delete(id)
    saveOrg()
    return { ok: true }
  })

  route('PUT', '/org/events/:id/seat-map', ({ params, body }, s) => {
    const ev = getEvent(s, params.id!)
    if (ev.status === 'cancelled' || ev.status === 'ended') throw new HttpError(409, 'INVALID_STATE', 'Evento encerrado')
    const map = body.seatMap as OrgSeatMap | null
    if (map) {
      if (!Array.isArray(map.rows) || !Array.isArray(map.sectors) || map.sectors.length === 0) throw new HttpError(422, 'VALIDATION_ERROR', 'Mapa inválido')
      const ids = new Set(map.sectors.map((x) => x.id))
      for (const r of map.rows) for (const c of r.cells) if (c && !ids.has(c.sectorId)) throw new HttpError(422, 'VALIDATION_ERROR', 'Assento com setor inexistente')
      if (ev.status === 'published' && statsFor(s, ev.id).sold > 0) {
        const sold = new Set(s.tickets.filter((t) => t.eventId === ev.id && t.status === 'valid' && t.seat).map((t) => t.seat))
        for (const r of map.rows) for (const c of r.cells) if (c && c.blocked && sold.has(c.label)) throw new HttpError(409, 'SEAT_SOLD', `O assento ${c.label} já foi vendido e não pode ser bloqueado`)
      }
    }
    ev.hasSeatMap = !!map
    ev.seatMap = map
    ev.updatedAt = new Date().toISOString()
    persist()
    return toOrgEvent(s, ev)
  })

  /* Lotes */
  route('GET', '/org/events/:id/lots', ({ params }, s) => {
    const ev = getEvent(s, params.id!)
    return lotsOf(s, ev.id).map((l) => ({ ...l, status: lotStatus(l, ev.status) }))
  })

  route('POST', '/org/events/:id/lots', ({ params, body }, s) => {
    const ev = getEvent(s, params.id!)
    if (ev.status === 'cancelled' || ev.status === 'ended') throw new HttpError(409, 'INVALID_STATE', 'Evento encerrado')
    const input = body as unknown as OrgLotInput
    validateLot(input, true)
    const lot: OrgLot = { ...input, typeName: input.typeName.trim(), name: input.name.trim(), id: nextId(s, 'olot'), eventId: ev.id, sold: 0, status: ev.status === 'draft' ? 'draft' : 'published' }
    s.lots.set(lot.id, lot)
    persist()
    return new Created({ ...lot, status: lotStatus(lot, ev.status) })
  })

  route('PATCH', '/org/lots/:id', ({ params, body }, s) => {
    const lot = s.lots.get(params.id!)
    if (!lot) throw new HttpError(404, 'NOT_FOUND', 'Lote não encontrado')
    const ev = getEvent(s, lot.eventId)
    const input = body as Partial<OrgLotInput>
    validateLot(input, false)
    if (input.quantity !== undefined && input.quantity < lot.sold) {
      throw new HttpError(422, 'VALIDATION_ERROR', `A quantidade não pode ser menor que os ${lot.sold} ingressos já vendidos`)
    }
    // Preço de lote com vendas só vale para novas compras (regra do protótipo): permitido, ingressos vendidos mantêm o preço.
    Object.assign(lot, input)
    persist()
    return { ...lot, status: lotStatus(lot, ev.status) }
  })

  route('DELETE', '/org/lots/:id', ({ params }, s) => {
    const lot = s.lots.get(params.id!)
    if (!lot) throw new HttpError(404, 'NOT_FOUND', 'Lote não encontrado')
    if (lot.sold > 0) throw new HttpError(409, 'INVALID_STATE', 'Lotes com vendas não podem ser removidos')
    s.lots.delete(lot.id)
    persist()
    return { ok: true }
  })

  /* Pedidos */
  route('GET', '/org/orders', ({ query }, s) => {
    const q = str(query.q).toLowerCase()
    const from = str(query.from)
    const to = str(query.to)
    const items = s.orders.filter((o) => {
      if (query.eventId && o.eventId !== query.eventId) return false
      if (query.method && o.paymentMethod !== query.method) return false
      if (query.status && o.status !== query.status) return false
      if (from && dayKey(o.createdAt) < from) return false
      if (to && dayKey(o.createdAt) > to) return false
      if (q && !`${o.code} ${o.buyerName} ${o.buyerEmail} ${o.eventTitle}`.toLowerCase().includes(q)) return false
      return true
    })
    return paginate(items, num(query.page, 1), Math.min(500, num(query.pageSize, 12)))
  })

  route('GET', '/org/orders/:id', ({ params }, s) => {
    const o = s.orders.find((x) => x.id === params.id)
    if (!o) throw new HttpError(404, 'NOT_FOUND', 'Pedido não encontrado')
    return o
  })

  route('POST', '/org/orders/:id/refund', ({ params }, s) => {
    const o = s.orders.find((x) => x.id === params.id)
    if (!o) throw new HttpError(404, 'NOT_FOUND', 'Pedido não encontrado')
    if (o.status !== 'paid') throw new HttpError(409, 'INVALID_STATE', 'Só pedidos pagos podem ser reembolsados')
    if (s.tickets.some((t) => t.orderId === o.id && t.checkedInAt)) {
      throw new HttpError(409, 'INVALID_STATE', 'O pedido tem ingressos já utilizados e não pode ser reembolsado')
    }
    applyOrderStatus(s, o, 'refunded')
    persist()
    return o
  })

  /* Participantes */
  route('GET', '/org/attendees', ({ query }, s) => {
    const q = str(query.q).toLowerCase()
    const eventId = str(query.eventId)
    const status = str(query.status)
    const scope = s.tickets.filter((t) => !eventId || t.eventId === eventId)
    const items = scope
      .filter((t) => (!status || attendeeStatus(t) === status) && (!q || `${t.name} ${t.code} ${t.email}`.toLowerCase().includes(q)))
      .map(toAttendee)
    const valid = scope.filter((t) => t.status === 'valid')
    return { ...paginate(items, num(query.page, 1), Math.min(500, num(query.pageSize, 15))), checkedIn: valid.filter((t) => t.checkedInAt).length, sold: valid.length }
  })

  /** Check-in manual a partir da lista de participantes. */
  route('POST', '/org/attendees/:ticketId/checkin', ({ params, body }, s) => {
    const t = s.tickets.find((x) => x.id === params.ticketId)
    if (!t) throw new HttpError(404, 'NOT_FOUND', 'Ingresso não encontrado')
    if (t.status === 'cancelled') throw new HttpError(409, 'INVALID_STATE', 'Ingresso cancelado')
    if (t.checkedInAt) throw new HttpError(409, 'ALREADY_USED', 'Check-in já realizado')
    t.checkedInAt = new Date().toISOString()
    t.gate = str(body.gate) || 'Manual'
    logEntry(s, { at: t.checkedInAt, result: 'valid', code: t.code, holderName: t.name, gate: t.gate })
    persist()
    return toAttendee(t)
  })

  route('DELETE', '/org/attendees/:ticketId/checkin', ({ params }, s) => {
    const t = s.tickets.find((x) => x.id === params.ticketId)
    if (!t) throw new HttpError(404, 'NOT_FOUND', 'Ingresso não encontrado')
    t.checkedInAt = undefined
    t.gate = undefined
    persist()
    return toAttendee(t)
  })

  /* Check-in (scanner) */
  route('GET', '/org/events/:id/checkin', ({ params }, s) => {
    const ev = getEvent(s, params.id!)
    const st = statsFor(s, ev.id)
    const tenMin = Date.now() - 10 * 60_000
    const recent = s.log.filter((l) => l.result === 'valid' && new Date(l.at).getTime() >= tenMin).length
    const stats: CheckinStats = {
      eventId: ev.id,
      eventTitle: ev.title,
      checkedIn: st.checkedIn,
      sold: st.sold,
      perMinute: Math.round((recent / 10) * 10) / 10,
      gates: ['Portão A', 'Portão B', 'Portão C'],
      recent: s.log.slice(0, 12),
    }
    return stats
  })

  route('POST', '/org/events/:id/checkin', ({ params, body }, s) => {
    const ev = getEvent(s, params.id!)
    if (ev.status !== 'published') throw new HttpError(409, 'EVENT_NOT_ACTIVE', 'O check-in só está disponível para eventos publicados')
    const code = str(body.code)
    if (!code.trim()) throw new HttpError(422, 'VALIDATION_ERROR', 'Informe o código do ingresso')
    const result = performCheckin(s, ev, code, str(body.gate) || 'Portão A')
    persist()
    return result
  })

  /* Configurações */
  route('GET', '/org/settings', (_c, s) => s.settings)

  route('PATCH', '/org/settings', ({ body }, s) => {
    const b = body as Partial<OrgSettings>
    if (b.name !== undefined && !b.name.trim()) throw new HttpError(422, 'VALIDATION_ERROR', 'Informe o nome da organização')
    if (b.email !== undefined && !/^\S+@\S+\.\S+$/.test(b.email)) throw new HttpError(422, 'VALIDATION_ERROR', 'E-mail inválido')
    if (b.document !== undefined && b.document && !/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(b.document) && !isValidCpf(b.document)) {
      throw new HttpError(422, 'VALIDATION_ERROR', 'CNPJ ou CPF inválido')
    }
    s.settings = { ...s.settings, ...(b.name !== undefined && { name: b.name }), ...(b.document !== undefined && { document: b.document }), ...(b.email !== undefined && { email: b.email }), ...(b.phone !== undefined && { phone: b.phone }), ...(b.payout && { payout: { ...s.settings.payout, ...b.payout } }) }
    persist()
    return s.settings
  })

  route('POST', '/org/members', ({ body }, s) => {
    const email = str(body.email).trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(422, 'VALIDATION_ERROR', 'E-mail inválido')
    if (s.settings.members.some((m) => m.email === email)) throw new HttpError(409, 'EMAIL_TAKEN', 'Este e-mail já faz parte da equipe')
    const role = (['MANAGER', 'CHECKIN'] as const).find((r) => r === body.role) ?? 'CHECKIN'
    s.settings.members.push({ id: nextId(s, 'mem'), name: str(body.name).trim() || email.split('@')[0]!, email, role })
    persist()
    return new Created(s.settings)
  })

  route('DELETE', '/org/members/:id', ({ params }, s) => {
    const m = s.settings.members.find((x) => x.id === params.id)
    if (!m) throw new HttpError(404, 'NOT_FOUND', 'Membro não encontrado')
    if (m.role === 'OWNER') throw new HttpError(409, 'INVALID_STATE', 'O proprietário não pode ser removido')
    s.settings.members = s.settings.members.filter((x) => x.id !== m.id)
    persist()
    return s.settings
  })

  route('POST', '/org/webhooks', ({ body }, s) => {
    const url = str(body.url).trim()
    if (!/^https:\/\/.+/.test(url)) throw new HttpError(422, 'VALIDATION_ERROR', 'A URL precisa começar com https://')
    s.settings.webhooks.push({ id: nextId(s, 'wh'), url, events: Array.isArray(body.events) && body.events.length ? (body.events as string[]) : ['order.paid'], active: true })
    persist()
    return new Created(s.settings)
  })

  route('PATCH', '/org/webhooks/:id', ({ params, body }, s) => {
    const w = s.settings.webhooks.find((x) => x.id === params.id)
    if (!w) throw new HttpError(404, 'NOT_FOUND', 'Webhook não encontrado')
    if (typeof body.active === 'boolean') w.active = body.active
    persist()
    return s.settings
  })

  route('DELETE', '/org/webhooks/:id', ({ params }, s) => {
    s.settings.webhooks = s.settings.webhooks.filter((x) => x.id !== params.id)
    persist()
    return s.settings
  })

  /* Avisos e busca */
  route('GET', '/org/notifications', (_c, s) => [...s.notices].sort((a, b) => b.at.localeCompare(a.at)))
  route('POST', '/org/notifications/read', (_c, s) => {
    for (const n of s.notices) n.read = true
    persist()
    return { ok: true }
  })

  route('GET', '/org/search', ({ query }, s) => {
    const q = str(query.q).trim().toLowerCase()
    if (q.length < 2) return { events: [], orders: [] }
    return {
      events: [...s.events.values()].filter((e) => e.title.toLowerCase().includes(q)).slice(0, 5).map((e) => ({ id: e.id, title: e.title, status: e.status })),
      orders: s.orders.filter((o) => `${o.code} ${o.buyerName} ${o.buyerEmail}`.toLowerCase().includes(q)).slice(0, 5).map((o) => ({ id: o.id, code: o.code, buyerName: o.buyerName, eventTitle: o.eventTitle })),
    }
  })

  /** SOMENTE MOCK: volta o painel ao estado inicial. */
  route('POST', '/dev/org/reset', () => {
    try {
      localStorage.removeItem('tf:mock-org:v1')
    } catch {
      /* ignora */
    }
    window.location.reload()
    return { ok: true }
  })
}
