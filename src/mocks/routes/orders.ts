import { expandSlots, round2 } from '@/lib/purchase'
import {
  cardExpiryStatus,
  isValidBirthDate,
  isValidCardNumber,
  isValidCpf,
  isValidPhone,
  onlyDigits,
} from '@/lib/validation'
import type { CreateOrderInput, Order, PaymentMethod } from '@/types/purchase'
import type { AddRoute } from '../adapter'
import { getSalesByEventId } from '../data/sales'
import { type Db, type DbOrder, type DbReservation, type DbTicket, newTicketCode, qrPayload, randomCode, uid } from '../db'
import { Created, HttpError } from '../httpError'
import { expireStale, ownedReservation } from './reservations'

const DAY = 86_400_000
const PIX_TTL_MS = 30 * 60_000
const BOLETO_TTL_MS = 3 * DAY
const REFUND_WINDOW_MS = 7 * DAY
const REFUND_MIN_LEAD_MS = 2 * DAY

/** Marca assentos/estoque do pedido como vendidos (ou devolve, com `sign = -1`). */
function applyStock(db: Db, order: DbOrder, sign: 1 | -1): void {
  const reservationLike = order.slots ?? []
  for (const slot of reservationLike) {
    if (slot.seatId) {
      const list = db.soldSeats[order.eventId] ?? (db.soldSeats[order.eventId] = [])
      if (sign === 1) {
        if (!list.includes(slot.seatId)) list.push(slot.seatId)
      } else {
        db.soldSeats[order.eventId] = list.filter((s) => s !== slot.seatId)
      }
    } else {
      const key = `${order.eventId}:${slot.ticketTypeId}`
      db.soldStock[key] = Math.max(0, (db.soldStock[key] ?? 0) + sign)
    }
  }
}

function issueTickets(db: Db, order: DbOrder): void {
  const holders = order.holders ?? []
  for (const slot of order.slots ?? []) {
    const id = uid('tkt')
    const code = newTicketCode()
    const ticket: DbTicket = {
      id,
      code,
      orderId: order.id,
      orderCode: order.code,
      eventId: order.eventId,
      eventSlug: order.eventSlug,
      eventTitle: order.eventTitle,
      eventStartsAt: order.eventStartsAt,
      venueName: order.venueName,
      city: order.city,
      typeName: slot.typeName,
      sectorName: slot.sectorName,
      seatId: slot.seatId,
      row: slot.seatId?.charAt(0),
      holderName: holders.find((h) => h.slot === slot.slot)?.name.trim() || order.buyer.name,
      status: 'valid',
      qrPayload: qrPayload(id, code),
      ownerId: order.ownerId,
    }
    db.tickets.push(ticket)
  }
}

function refundable(order: DbOrder): boolean {
  if (order.status !== 'paid') return false
  const now = Date.now()
  return (
    now - new Date(order.createdAt).getTime() <= REFUND_WINDOW_MS &&
    new Date(order.eventStartsAt).getTime() - now > REFUND_MIN_LEAD_MS
  )
}

/** Pedidos pendentes cujo prazo de pagamento passou viram `expired` e devolvem o estoque. */
function refresh(db: Db, order: DbOrder): void {
  if (order.status !== 'pending') return
  const due = order.pix?.expiresAt ?? order.boleto?.dueAt
  if (due && new Date(due).getTime() <= Date.now()) {
    order.status = 'expired'
    applyStock(db, order, -1)
  }
}

export function publicOrder(db: Db, order: DbOrder): Order {
  refresh(db, order)
  const { ownerId, holders: _h, slots: _s, ...rest } = order
  return {
    ...rest,
    refundable: refundable(order),
    tickets: db.tickets
      .filter((t) => t.orderId === order.id && t.ownerId === ownerId)
      .map(({ ownerId: _o, ...t }) => t),
  }
}

function validateBuyer(input: CreateOrderInput): void {
  const b = input.buyer
  const errors: Record<string, string> = {}
  if (!b?.name?.trim() || b.name.trim().split(/\s+/).length < 2) errors.name = 'Informe nome e sobrenome'
  if (!/^\S+@\S+\.\S+$/.test(b?.email ?? '')) errors.email = 'E-mail inválido'
  if (!isValidPhone(b?.phone ?? '')) errors.phone = 'Informe o número completo com DDD'
  if (!isValidCpf(b?.cpf ?? '')) errors.cpf = 'CPF inválido'
  if (!isValidBirthDate(b?.birthDate ?? '')) errors.birthDate = 'Data inválida'
  if (Object.keys(errors).length) throw new HttpError(422, 'VALIDATION_ERROR', 'Confira os dados do comprador', { errors })
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Pedidos e pagamento SIMULADOS. Nenhum gateway é chamado e nenhum dado de
 * cartão é armazenado (só os 4 últimos dígitos). Regras da simulação:
 *   cartão terminado em 0002 → recusado (402) · Pix e boleto → pagamento pendente.
 */
export function registerOrderRoutes(add: AddRoute): void {
  add(
    'POST',
    '/orders',
    async ({ body, db, user }) => {
      const input = body as unknown as CreateOrderInput
      const reservation: DbReservation = ownedReservation(db, user!, String(input.reservationId))
      if (reservation.status === 'completed') throw new HttpError(409, 'ALREADY_COMPLETED', 'Esta reserva já virou um pedido')
      if (reservation.status !== 'active') throw new HttpError(410, 'RESERVATION_EXPIRED', 'Sua reserva expirou')

      const incomplete = reservation.items.some((i) => i.kind === 'seated' && i.seatIds.length !== i.quantity)
      if (incomplete) throw new HttpError(422, 'SEATS_INCOMPLETE', 'Escolha todos os assentos antes de pagar')

      validateBuyer(input)
      const method = input.payment?.method as PaymentMethod
      if (!['pix', 'card', 'boleto'].includes(method)) throw new HttpError(422, 'VALIDATION_ERROR', 'Forma de pagamento inválida')

      let last4: string | undefined
      let installments: number | undefined
      if (method === 'card') {
        const card = input.payment.card
        // O mock só recebe os dados crus (toPaymentCard não tokeniza no modo mock).
        if (!card || !('number' in card) || !isValidCardNumber(card.number) || cardExpiryStatus(card.expiry) !== 'ok' || !/^\d{3,4}$/.test(card.cvv ?? '')) {
          throw new HttpError(422, 'VALIDATION_ERROR', 'Confira os dados do cartão')
        }
        last4 = onlyDigits(card.number).slice(-4)
        installments = Math.max(1, Math.min(6, Number(card.installments) || 1))
        await wait(1500) // "processando…"
        expireStale(db)
        if (reservation.status !== 'active') throw new HttpError(410, 'RESERVATION_EXPIRED', 'Sua reserva expirou')
        if (last4 === '0002') {
          throw new HttpError(402, 'PAYMENT_DECLINED', 'Pagamento recusado pelo banco. Nenhum valor foi cobrado.')
        }
      }

      const now = Date.now()
      const slots = expandSlots(reservation)
      const code = `TF-${db.orderSeq++}`
      const order: DbOrder = {
        id: uid('ord'),
        code,
        ownerId: user!.id,
        eventId: reservation.eventId,
        eventSlug: reservation.eventSlug,
        eventTitle: reservation.eventTitle,
        eventStartsAt: reservation.eventStartsAt,
        venueName: reservation.venueName,
        city: '',
        createdAt: new Date(now).toISOString(),
        status: method === 'card' ? 'paid' : 'pending',
        paymentMethod: method,
        cardLast4: last4,
        installments,
        pix: method === 'pix' ? { code: `00020126580014br.gov.bcb.pix0136${randomCode(8)}-${randomCode(4)}-${randomCode(12)}5204000053039865406${round2(reservation.total).toFixed(2)}5802BR5909TicketFlow6009SAO PAULO62070503***6304${randomCode(4)}`, expiresAt: new Date(now + PIX_TTL_MS).toISOString() } : undefined,
        boleto: method === 'boleto' ? { line: `34191.79001 01043.510047 91020.150008 ${randomCode(1)} ${String(Math.floor(Math.random() * 1e14)).padStart(14, '0')}`, dueAt: new Date(now + BOLETO_TTL_MS).toISOString() } : undefined,
        lines: reservation.items.map((i) => ({
          description: `${i.name}${i.sectorName && i.sectorName !== i.name ? ` · ${i.sectorName}` : ''}`,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          seatIds: i.seatIds,
        })),
        ticketCount: slots.length,
        subtotal: reservation.subtotal,
        fee: reservation.fee,
        total: reservation.total,
        buyer: input.buyer,
        refundable: false,
        tickets: [],
        holders: input.holders ?? [],
        slots,
      }
      order.city = getSalesByEventId(order.eventId)?.city ?? ''

      reservation.status = 'completed'
      applyStock(db, order, 1)
      db.orders.push(order)
      if (order.status === 'paid') issueTickets(db, order)
      return new Created(publicOrder(db, order))
    },
    { auth: true },
  )

  add('GET', '/orders', ({ db, user }) =>
    db.orders
      .filter((o) => o.ownerId === user!.id)
      .map((o) => publicOrder(db, o))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    { auth: true },
  )

  add(
    'GET',
    '/orders/:id',
    ({ params, db, user }) => {
      const order = db.orders.find((o) => o.id === params.id && o.ownerId === user!.id)
      if (!order) throw new HttpError(404, 'NOT_FOUND', 'Pedido não encontrado')
      return publicOrder(db, order)
    },
    { auth: true },
  )

  /** Cancelamento com reembolso (regra: até 7 dias após a compra e 48 h antes do evento). */
  add(
    'POST',
    '/orders/:id/cancel',
    ({ params, db, user }) => {
      const order = db.orders.find((o) => o.id === params.id && o.ownerId === user!.id)
      if (!order) throw new HttpError(404, 'NOT_FOUND', 'Pedido não encontrado')
      refresh(db, order)
      if (order.status === 'pending') {
        order.status = 'expired'
        applyStock(db, order, -1)
      } else if (order.status === 'paid') {
        if (!refundable(order)) {
          throw new HttpError(422, 'REFUND_NOT_ALLOWED', 'Este pedido não pode mais ser reembolsado pela política do evento.')
        }
        order.status = 'refunded'
        order.refundedAt = new Date().toISOString()
        for (const t of db.tickets) if (t.orderId === order.id) t.status = 'cancelled'
        applyStock(db, order, -1)
      } else {
        throw new HttpError(409, 'INVALID_STATE', 'Este pedido já foi encerrado')
      }
      return publicOrder(db, order)
    },
    { auth: true },
  )

  /**
   * SOMENTE MOCK: confirma o pagamento de um pedido pendente (no backend real
   * isso chega por webhook do gateway). Não faz parte do contrato de produção.
   */
  add(
    'POST',
    '/dev/orders/:id/simulate-payment',
    ({ params, db, user }) => {
      const order = db.orders.find((o) => o.id === params.id && o.ownerId === user!.id)
      if (!order) throw new HttpError(404, 'NOT_FOUND', 'Pedido não encontrado')
      refresh(db, order)
      if (order.status !== 'pending') throw new HttpError(409, 'INVALID_STATE', 'O pedido não está pendente')
      order.status = 'paid'
      issueTickets(db, order)
      return publicOrder(db, order)
    },
    { auth: true },
  )
}
