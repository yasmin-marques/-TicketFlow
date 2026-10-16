import { computeTotals, parseSeatId, unitFee } from '@/lib/purchase'
import type {
  ConflictBody,
  CreateReservationInput,
  EventSales,
  Reservation,
  ReservationItem,
  TicketType,
} from '@/types/purchase'
import type { AddRoute } from '../adapter'
import { getSalesByEventId } from '../data/sales'
import { type Db, type DbReservation, type DbUser, uid } from '../db'
import { Created, HttpError } from '../httpError'
import { isSeatTaken, markTakenByOther, suggestNeighbors } from '../seats'

const RESERVATION_TTL_MS = 10 * 60_000
const SHORT_TTL_MS = 45_000

export function publicReservation(r: DbReservation): Reservation {
  const { ownerId: _owner, ...rest } = r
  return rest
}

/** Marca como expiradas as reservas ativas cujo prazo passou (libera assentos e estoque). */
export function expireStale(db: Db): void {
  const now = Date.now()
  for (const r of db.reservations) {
    if (r.status === 'active' && new Date(r.expiresAt).getTime() <= now) r.status = 'expired'
  }
}

export function ownedReservation(db: Db, user: DbUser, id: string): DbReservation {
  expireStale(db)
  const r = db.reservations.find((x) => x.id === id && x.ownerId === user.id)
  if (!r) throw new HttpError(404, 'NOT_FOUND', 'Reserva não encontrada')
  return r
}

function conflict(status: number, body: ConflictBody): never {
  throw new HttpError(status, body.code, body.message, body as unknown as Record<string, unknown>)
}

/** Ingressos sem assento ainda disponíveis para o usuário (descontadas vendas e reservas de terceiros). */
function generalStock(db: Db, sales: EventSales, type: TicketType, userId: string): number {
  const sold = db.soldStock[`${sales.eventId}:${type.id}`] ?? 0
  const held = db.reservations
    .filter((r) => r.eventId === sales.eventId && r.status === 'active' && r.ownerId !== userId)
    .flatMap((r) => r.items)
    .filter((i) => i.ticketTypeId === type.id)
    .reduce((s, i) => s + i.quantity, 0)
  return Math.max(0, type.lot.remaining - sold - held)
}

const SEAT_RE = /^[A-H](0[1-9]|1[0-6])$/
/** O conflito forçado do modo de demonstração dispara uma vez por carga da página. */
let conflictDemoFired = false

/** Valida assentos de um tipo; lança 409 (com sugestões) se algum foi perdido. */
function checkSeats(
  sales: EventSales,
  type: TicketType,
  seatIds: string[],
  user: DbUser,
  previous: string[],
  forceConflict: boolean,
): void {
  const layout = sales.seatMap
  const sector = layout?.sectors.find((s) => s.id === type.sectorId)
  if (!layout || !sector) throw new HttpError(422, 'VALIDATION_ERROR', 'Este tipo de ingresso não tem assento marcado')
  if (new Set(seatIds).size !== seatIds.length) throw new HttpError(422, 'VALIDATION_ERROR', 'Assentos repetidos')

  for (const id of seatIds) {
    if (!SEAT_RE.test(id) || !sector.rows.includes(parseSeatId(id).row)) {
      throw new HttpError(422, 'VALIDATION_ERROR', `Assento ${id} não pertence ao setor ${sector.name}`)
    }
  }

  const added = seatIds.filter((id) => !previous.includes(id))
  const lost = added.filter((id) => isSeatTaken(sales.eventId, id, user.id))

  // Modo de demonstração (?mock=conflito): na primeira escolha, "outra pessoa" leva o assento.
  if (forceConflict && !conflictDemoFired && added.length > 0 && lost.length === 0) {
    const victim = added[added.length - 1]!
    conflictDemoFired = true
    markTakenByOther(sales.eventId, victim)
    lost.push(victim)
  }

  if (lost.length) {
    const suggestions = suggestNeighbors(sales.eventId, lost[0]!, user.id, seatIds)
    conflict(409, {
      code: 'SEAT_UNAVAILABLE',
      message: `Esse assento (${lost.join(', ')}) acabou de ser reservado por outra pessoa.`,
      seatIds: lost,
      suggestions,
    })
  }
}

function buildItem(sales: EventSales, type: TicketType, quantity: number, seatIds: string[]): ReservationItem {
  const sector = sales.seatMap?.sectors.find((s) => s.id === type.sectorId)
  return {
    ticketTypeId: type.id,
    name: type.name,
    kind: type.kind,
    sectorId: type.sectorId,
    sectorName: sector?.name,
    quantity,
    unitPrice: type.price,
    unitFee: unitFee(type.price, sales.serviceFeePct),
    seatIds,
  }
}

function withTotals(r: Omit<DbReservation, 'subtotal' | 'fee' | 'total'>): DbReservation {
  const t = computeTotals(r.items)
  return { ...r, subtotal: t.subtotal, fee: t.fee, total: t.total }
}

/**
 * Reservas temporárias com prazo (`expiresAt`). Aqui o "lock" é só uma
 * simulação local: a prevenção real de venda duplicada (lock distribuído +
 * transação no banco) é responsabilidade do backend.
 */
export function registerReservationRoutes(add: AddRoute): void {
  /** Cria a reserva (substitui qualquer reserva ativa do usuário). */
  add(
    'POST',
    '/reservations',
    ({ body, db, user, mode }) => {
      expireStale(db)
      const input = body as unknown as CreateReservationInput
      const sales = getSalesByEventId(String(input.eventId))
      if (!sales) throw new HttpError(404, 'NOT_FOUND', 'Evento não encontrado')
      if (!Array.isArray(input.items) || input.items.length === 0) {
        throw new HttpError(422, 'VALIDATION_ERROR', 'Escolha ao menos um ingresso')
      }
      const total = input.items.reduce((s, i) => s + Number(i.quantity), 0)
      if (total < 1) throw new HttpError(422, 'VALIDATION_ERROR', 'Escolha ao menos um ingresso')
      if (total > sales.maxPerOrder) {
        throw new HttpError(422, 'LIMIT_EXCEEDED', `Limite de ${sales.maxPerOrder} ingressos por pedido`)
      }

      // Valida tudo antes de alterar qualquer estado.
      const items: ReservationItem[] = input.items.map((raw) => {
        const type = sales.ticketTypes.find((t) => t.id === raw.ticketTypeId)
        const quantity = Number(raw.quantity)
        if (!type || !Number.isInteger(quantity) || quantity < 1) {
          throw new HttpError(422, 'VALIDATION_ERROR', 'Ingresso inválido')
        }
        if (type.lot.status !== 'open') {
          conflict(409, { code: 'LOT_CLOSED', message: `O ${type.lot.name} de ${type.name} não está disponível.` })
        }
        if (type.kind === 'general') {
          if (generalStock(db, sales, type, user!.id) < quantity) {
            conflict(409, { code: 'INSUFFICIENT_STOCK', message: `Restam poucos ingressos de ${type.name}. Reduza a quantidade.` })
          }
          return buildItem(sales, type, quantity, [])
        }
        const seatIds = raw.seatIds ?? []
        if (seatIds.length > quantity) throw new HttpError(422, 'VALIDATION_ERROR', 'Mais assentos do que ingressos')
        if (seatIds.length) checkSeats(sales, type, seatIds, user!, [], mode === 'conflito')
        return buildItem(sales, type, quantity, seatIds)
      })

      for (const r of db.reservations) {
        if (r.ownerId === user!.id && r.status === 'active') r.status = 'released'
      }

      const now = Date.now()
      const ttl = mode === 'expira' ? SHORT_TTL_MS : RESERVATION_TTL_MS
      const reservation = withTotals({
        id: uid('res'),
        ownerId: user!.id,
        eventId: sales.eventId,
        eventSlug: sales.slug,
        eventTitle: sales.title,
        eventStartsAt: sales.startsAt,
        venueName: sales.venueName,
        status: 'active',
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttl).toISOString(),
        items,
      })
      db.reservations.push(reservation)
      return new Created(publicReservation(reservation))
    },
    { auth: true },
  )

  add('GET', '/reservations/:id', ({ params, db, user }) => publicReservation(ownedReservation(db, user!, params.id!)), { auth: true })

  /** Substitui os assentos escolhidos de um tipo (idempotente: reenviar o mesmo conjunto não muda nada). */
  add(
    'PUT',
    '/reservations/:id/items/:typeId/seats',
    ({ params, body, db, user, mode }) => {
      const r = ownedReservation(db, user!, params.id!)
      if (r.status !== 'active') throw new HttpError(410, 'RESERVATION_EXPIRED', 'Sua reserva expirou')
      const item = r.items.find((i) => i.ticketTypeId === params.typeId)
      if (!item || item.kind !== 'seated') throw new HttpError(404, 'NOT_FOUND', 'Item da reserva não encontrado')
      const sales = getSalesByEventId(r.eventId)!
      const type = sales.ticketTypes.find((t) => t.id === item.ticketTypeId)!
      const seatIds = Array.isArray(body.seatIds) ? (body.seatIds as string[]) : []
      if (seatIds.length > item.quantity) {
        throw new HttpError(422, 'VALIDATION_ERROR', `Você escolheu ingressos para ${item.quantity} assento(s)`)
      }
      checkSeats(sales, type, seatIds, user!, item.seatIds, mode === 'conflito')
      item.seatIds = seatIds
      return publicReservation(r)
    },
    { auth: true },
  )

  /** Libera a reserva (usuário saiu do fluxo). */
  add(
    'DELETE',
    '/reservations/:id',
    ({ params, db, user }) => {
      const r = ownedReservation(db, user!, params.id!)
      if (r.status === 'active') r.status = 'released'
      return { ok: true }
    },
    { auth: true },
  )
}
