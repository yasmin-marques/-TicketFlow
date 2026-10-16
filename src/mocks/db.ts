import type { NotificationPrefs, SavedCard, UserRole } from '@/types/auth'
import type { Slot } from '@/lib/purchase'
import type { Order, Reservation, Ticket, TicketHolder } from '@/types/purchase'
import { EVENTS } from './data/events'
import { addHours } from './data/dates'

/**
 * Banco em memória do servidor mock, persistido em localStorage para que
 * reservas, pedidos e ingressos sobrevivam a recarregamentos.
 * ATENÇÃO: é só uma simulação — não oferece qualquer garantia de concorrência
 * ou de segurança. No produto real isso é responsabilidade do backend.
 */
export interface DbUser {
  id: string
  role: UserRole
  name: string
  email: string
  /** Texto puro: é um mock. O backend real guarda apenas o hash. */
  password: string
  phone: string
  cpf: string
  birthDate: string
  notifications: NotificationPrefs
  cards: SavedCard[]
}

export type DbReservation = Reservation & { ownerId: string }
/** `holders`/`slots` guardam o que é preciso para emitir os ingressos de um pedido pendente. */
export type DbOrder = Order & { ownerId: string; holders?: TicketHolder[]; slots?: Slot[] }
export type DbTicket = Ticket & { ownerId: string }

export interface Db {
  version: 1
  users: DbUser[]
  reservations: DbReservation[]
  orders: DbOrder[]
  tickets: DbTicket[]
  /** Assentos vendidos por evento (além da base determinística). */
  soldSeats: Record<string, string[]>
  /** Ingressos sem assento vendidos: chave `${eventId}:${ticketTypeId}`. */
  soldStock: Record<string, number>
  idempotency: Record<string, { status: number; data: unknown }>
  resetTokens: Record<string, string>
  waitlist: string[]
  orderSeq: number
}

const KEY = 'tf:mock-db:v1'
let cache: Db | null = null

export const DEMO_USER_ID = 'usr_camila'
export const DEMO_EMAIL = 'camila@exemplo.com'
export const DEMO_PASSWORD = 'ticketflow123'
export const ORGANIZER_USER_ID = 'usr_organizer'
export const ORGANIZER_EMAIL = 'organizador@pulse.com'

function organizerUser(): DbUser {
  return {
    id: ORGANIZER_USER_ID,
    role: 'ORGANIZER',
    name: 'Rafael Souza',
    email: ORGANIZER_EMAIL,
    password: DEMO_PASSWORD,
    phone: '(11) 97766-5544',
    cpf: '',
    birthDate: '',
    notifications: { orderUpdates: true, eventReminders: true, marketing: false },
    cards: [],
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function randomCode(length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return out
}

export const newTicketCode = () => `TF-${randomCode(4)}-${randomCode(4)}`

/** Conteúdo do QR. Num backend real isto leva assinatura (HMAC/JWT) verificada no check-in. */
export const qrPayload = (ticketId: string, code: string) => `TF1.${ticketId}.${code}`

export const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`

function seed(): Db {
  const neon = EVENTS[0]!
  const jazz = EVENTS[3]!
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()

  const buyer = {
    name: 'Camila Duarte',
    email: DEMO_EMAIL,
    phone: '(11) 98877-6655',
    cpf: '123.456.789-09',
    birthDate: '14/03/1994',
  }

  const orders: DbOrder[] = []
  const tickets: DbTicket[] = []

  const addOrder = (o: {
    n: number
    event: { id: string; slug: string; title: string; startsAt: string; venue: { name: string; city: string } }
    typeName: string
    sector?: string
    seats?: string[]
    qty: number
    unitPrice: number
    method: Order['paymentMethod']
    createdAt: string
    status: Order['status']
    ticketStatus: Ticket['status']
    last4?: string
  }) => {
    const id = `ord_seed${o.n}`
    const subtotal = o.unitPrice * o.qty
    const fee = Math.round(subtotal * 10) / 100
    const orderTickets: DbTicket[] = Array.from({ length: o.qty }, (_, i) => {
      const tid = `tkt_seed${o.n}${i}`
      const code = i === 0 && o.n === 48213 ? 'TF-7K2M-9QX4' : newTicketCode()
      const seat = o.seats?.[i]
      return {
        id: tid,
        code,
        orderId: id,
        orderCode: `TF-${o.n}`,
        eventId: o.event.id,
        eventSlug: o.event.slug,
        eventTitle: o.event.title,
        eventStartsAt: o.event.startsAt,
        venueName: o.event.venue.name,
        city: o.event.venue.city,
        typeName: o.typeName,
        sectorName: o.sector,
        seatId: seat,
        row: seat?.charAt(0),
        holderName: buyer.name,
        status: o.ticketStatus,
        usedAt: o.ticketStatus === 'used' ? o.event.startsAt : undefined,
        qrPayload: qrPayload(tid, code),
        ownerId: DEMO_USER_ID,
      }
    })
    tickets.push(...orderTickets)
    orders.push({
      id,
      code: `TF-${o.n}`,
      eventId: o.event.id,
      eventSlug: o.event.slug,
      eventTitle: o.event.title,
      eventStartsAt: o.event.startsAt,
      venueName: o.event.venue.name,
      city: o.event.venue.city,
      createdAt: o.createdAt,
      status: o.status,
      paymentMethod: o.method,
      cardLast4: o.last4,
      installments: o.last4 ? 1 : undefined,
      lines: [{ description: `${o.typeName}${o.sector ? ` · ${o.sector}` : ''}`, quantity: o.qty, unitPrice: o.unitPrice, seatIds: o.seats ?? [] }],
      ticketCount: o.qty,
      subtotal,
      fee,
      total: Math.round((subtotal + fee) * 100) / 100,
      buyer,
      refundable: false,
      tickets: orderTickets.map(({ ownerId: _o, ...t }) => t),
      refundedAt: o.status === 'refunded' ? daysAgo(40) : undefined,
      ownerId: DEMO_USER_ID,
      slots: Array.from({ length: o.qty }, (_, i) => ({
        slot: o.seats?.[i] ?? `${o.typeName.toLowerCase()}#${i + 1}`,
        ticketTypeId: o.typeName.toLowerCase(),
        typeName: o.typeName,
        sectorName: o.sector,
        seatId: o.seats?.[i],
        unitPrice: o.unitPrice,
      })),
    })
  }

  addOrder({ n: 48213, event: neon, typeName: 'Premium', sector: 'Premium', seats: ['B03', 'B04'], qty: 2, unitPrice: 120, method: 'pix', createdAt: daysAgo(1), status: 'paid', ticketStatus: 'valid' })
  addOrder({ n: 48209, event: jazz, typeName: 'Premium', sector: 'Premium', seats: ['A11'], qty: 1, unitPrice: 70, method: 'card', last4: '4410', createdAt: daysAgo(2), status: 'paid', ticketStatus: 'valid' })

  const past = (title: string, slug: string, days: number) => ({
    id: `evt_past_${slug}`,
    slug,
    title,
    startsAt: addHours(new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19) + '-03:00', 0),
    venue: { name: 'Casa de Shows', city: 'São Paulo' },
  })
  const olds: Array<[number, string, string, number, number, number]> = [
    [48102, 'Rock na Fábrica 2025', 'rock-na-fabrica-2025', 60, 2, 55],
    [48077, 'Festival de Verão', 'festival-de-verao', 95, 2, 90],
    [48031, 'Feira do Livro', 'feira-do-livro', 130, 2, 20],
    [47980, 'Stand-up Night Especial', 'stand-up-night-especial', 170, 2, 70],
  ]
  for (const [n, title, slug, days, qty, price] of olds) {
    addOrder({ n, event: past(title, slug, days), typeName: 'Inteira', qty, unitPrice: price, method: 'card', last4: '4410', createdAt: daysAgo(days + 10), status: 'paid', ticketStatus: 'used' })
  }
  addOrder({ n: 48120, event: past('Noite do Vinho Especial', 'noite-do-vinho-especial', 20), typeName: 'Inteira', qty: 1, unitPrice: 150, method: 'pix', createdAt: daysAgo(45), status: 'refunded', ticketStatus: 'cancelled' })

  return {
    version: 1,
    users: [
      organizerUser(),
      {
        id: DEMO_USER_ID,
        role: 'USER',
        name: 'Camila Duarte',
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        phone: '(11) 98877-6655',
        cpf: '123.456.789-09',
        birthDate: '14/03/1994',
        notifications: { orderUpdates: true, eventReminders: true, marketing: false },
        cards: [{ id: 'card_seed1', brand: 'Visa', last4: '4410', holderName: 'CAMILA M DUARTE', expiry: '09/29' }],
      },
    ],
    reservations: [],
    orders,
    tickets,
    soldSeats: { [neon.id]: ['B03', 'B04'], [jazz.id]: ['A11'] },
    soldStock: {},
    idempotency: {},
    resetTokens: {},
    waitlist: [],
    orderSeq: 48213 + 1,
  }
}

export function getDb(): Db {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Db
      if (parsed.version === 1) {
        // Migração de bancos salvos antes da Parte 3: papel dos usuários e conta de organizador.
        for (const u of parsed.users) u.role ??= 'USER'
        if (!parsed.users.some((u) => u.id === ORGANIZER_USER_ID)) parsed.users.unshift(organizerUser())
        cache = parsed
        return cache
      }
    }
  } catch {
    /* banco corrompido: recria */
  }
  cache = seed()
  saveDb()
  return cache
}

export function saveDb(): void {
  if (!cache) return
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* sem persistência: segue em memória */
  }
}

/** Apaga os dados simulados (útil para voltar ao estado inicial). */
export function resetDb(): void {
  cache = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignora */
  }
}
