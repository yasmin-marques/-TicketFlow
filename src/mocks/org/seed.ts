import { addHours, inDays } from '../data/dates'
import type { CategorySlug } from '@/types/event'
import type {
  OrgEventStatus,
  OrgLot,
  OrgNotice,
  OrgOrder,
  OrgPaymentMethod,
  OrgSeatMap,
  OrgSettings,
} from '@/types/organizer'
import type { StoredEvent } from './store'

export interface OrgTicketRec {
  id: string
  code: string
  orderId: string
  orderCode: string
  eventId: string
  lotId: string
  typeName: string
  sector: string
  seat: string | null
  name: string
  email: string
  status: 'valid' | 'cancelled'
  checkedInAt?: string
  gate?: string
}

export interface Seed {
  events: StoredEvent[]
  lots: OrgLot[]
  orders: OrgOrder[]
  tickets: OrgTicketRec[]
  settings: OrgSettings
  notices: OrgNotice[]
}

/** PRNG determinístico: a base é idêntica a cada carga. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST = ['Camila', 'Rafael', 'Beatriz', 'Tiago', 'Helena', 'Lucas', 'Marina', 'Pedro', 'Julia', 'Gabriel', 'Larissa', 'Mateus', 'Aline', 'Bruno', 'Carolina', 'Diego', 'Fernanda', 'Henrique', 'Isabela', 'João', 'Karina', 'Leonardo', 'Mariana', 'Nicolas', 'Olivia', 'Paulo', 'Renata', 'Sérgio', 'Talita', 'Vinícius']
const LAST = ['Duarte', 'Moreira', 'Lemos', 'Nascimento', 'Prado', 'Ferraz', 'Costa', 'Alves', 'Souza', 'Ribeiro', 'Carvalho', 'Mendes', 'Barros', 'Rocha', 'Dias', 'Teixeira', 'Pinto', 'Araújo', 'Cardoso', 'Melo']
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const day = (offset: number) => inDays(offset, '00:00').slice(0, 10)
const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

interface L {
  type: string
  name: string
  price: number
  qty: number
  sold: number
  from: number
  to: number
  sector?: 'premium' | 'standard'
}
const lot = (type: string, name: string, price: number, qty: number, sold: number, from: number, to: number, sector?: L['sector']): L => ({
  type, name, price, qty, sold, from, to, sector,
})

interface E {
  key: string
  title: string
  cat: CategorySlug
  days: number
  hh: string
  hours: number
  venue: string
  city?: string
  status: OrgEventStatus
  age: number
  seated?: boolean
  checkin?: number
  desc: string
  lots: L[]
}

const EVENTS: E[] = [
  { key: 'neon', title: 'Neon Horizon Festival', cat: 'musica', days: 8, hh: '20:00', hours: 10, venue: 'Centro de Eventos', status: 'published', age: 18, seated: true, checkin: 0.67, desc: 'Doze horas de música eletrônica, live acts e arte audiovisual em dois palcos. Pista, VIP e camarotes com visão frontal do palco principal.',
    lots: [lot('Pista', '1º lote', 80, 200, 200, -45, -15), lot('Pista', '2º lote', 100, 400, 312, -14, 5), lot('Premium', '1º lote', 120, 64, 32, -45, 7, 'premium'), lot('Standard', '1º lote', 80, 64, 23, -45, 7, 'standard'), lot('Camarote', 'Lote único', 250, 40, 12, -14, 7)] },
  { key: 'devsummit', title: 'DevSummit Brasil 2026', cat: 'tecnologia', days: 22, hh: '09:00', hours: 9, venue: 'Expo Center Norte', status: 'published', age: 0, desc: 'Dois dias de palestras, workshops e networking sobre engenharia de software, IA aplicada e plataformas.',
    lots: [lot('Inteira', '1º lote', 100, 150, 150, -50, -20), lot('Inteira', '2º lote', 120, 250, 250, -19, 10), lot('Inteira', '3º lote', 140, 200, 20, 0, 20)] },
  { key: 'jazz', title: 'Noites de Jazz na Praça', cat: 'cultura', days: 13, hh: '19:30', hours: 4, venue: 'Praça Roosevelt', status: 'published', age: 14, desc: 'Quartetos e big bands ocupam a praça numa série de noites ao ar livre.',
    lots: [lot('Plateia', '1º lote', 45, 120, 120, -40, -12), lot('Plateia', '2º lote', 55, 200, 168, -11, 12)] },
  { key: 'growth', title: 'Growth Conference', cat: 'negocios', days: 57, hh: '08:30', hours: 9, venue: 'Hotel Unique', status: 'published', age: 16, desc: 'Casos reais de crescimento, vendas e produto contados por quem executou.',
    lots: [lot('Inteira', '1º lote', 290, 100, 100, -30, 20), lot('Inteira', '2º lote', 340, 300, 18, -5, 50)] },
  { key: 'sabor', title: 'Festival do Sabor', cat: 'gastronomia', days: 50, hh: '12:00', hours: 8, venue: 'Parque Ibirapuera', status: 'draft', age: 0, desc: '',
    lots: [lot('Entrada', '1º lote', 35, 1200, 0, 0, 45)] },
  { key: 'rock', title: 'Rock na Fábrica 2025', cat: 'musica', days: -32, hh: '21:00', hours: 6, venue: 'Fábrica de Cultura', status: 'ended', age: 16, checkin: 0.93, desc: 'Cinco bandas autorais num galpão industrial.',
    lots: [lot('Geral', '1º lote', 55, 400, 400, -90, -60), lot('Geral', '2º lote', 65, 540, 540, -59, -33)] },
  { key: 'classico', title: 'Clássico no Morumbi', cat: 'esportes', days: 30, hh: '16:00', hours: 3, venue: 'Estádio do Morumbi', status: 'published', age: 0, seated: true, desc: 'O maior clássico do estado, com arquibancadas numeradas.',
    lots: [lot('Arquibancada', '1º lote', 60, 500, 500, -30, -5), lot('Arquibancada', '2º lote', 80, 500, 140, -4, 28)] },
  { key: 'vinho', title: 'Noite do Vinho', cat: 'gastronomia', days: 20, hh: '20:00', hours: 4, venue: 'Adega Vila Madalena', status: 'published', age: 18, desc: 'Degustação guiada de doze rótulos com sommelier convidado.',
    lots: [lot('Degustação', '1º lote', 150, 60, 60, -20, -4), lot('Degustação', '2º lote', 170, 90, 36, -3, 18)] },
  { key: 'corrida', title: 'Corrida Noturna 10K', cat: 'esportes', days: 5, hh: '19:00', hours: 3, venue: 'Parque da Aclimação', status: 'published', age: 0, desc: 'Percurso iluminado de 10 km com kit completo e medalha.',
    lots: [lot('Inscrição', 'Lote único', 90, 300, 210, -25, 4)] },
  { key: 'standup', title: 'Stand-up Night Especial', cat: 'cultura', days: -10, hh: '20:30', hours: 3, venue: 'Teatro Renault', status: 'ended', age: 16, checkin: 0.88, desc: 'Cinco comediantes numa só noite.',
    lots: [lot('Plateia', 'Lote único', 70, 300, 262, -50, -11)] },
  { key: 'hackathon', title: 'Hackathon Climate Tech', cat: 'tecnologia', days: 35, hh: '09:00', hours: 36, venue: 'Insper', status: 'draft', age: 16, desc: '',
    lots: [lot('Participante', 'Lote único', 25, 150, 0, 0, 30)] },
  { key: 'feira', title: 'Feira de Tecnologia do Interior', cat: 'tecnologia', days: 15, hh: '10:00', hours: 8, venue: 'Centro de Convenções', status: 'cancelled', age: 0, desc: 'Cancelada por indisponibilidade do local.',
    lots: [lot('Inteira', 'Lote único', 40, 200, 80, -30, 14)] },
]

function seatMapFor(e: E): OrgSeatMap {
  const sectors = [
    { id: 'premium', name: 'Premium', price: 120 },
    { id: 'standard', name: 'Standard', price: 80 },
  ]
  const rows = 'ABCDEFGH'.split('').map((letter, ri) => ({
    letter,
    cells: Array.from({ length: 16 }, (_, i) => ({
      label: `${letter}${String(i + 1).padStart(2, '0')}`,
      sectorId: ri < 4 ? 'premium' : 'standard',
      blocked: false,
    })),
  }))
  return { sectors, rows, generalCapacity: e.key === 'neon' ? 640 : 0 }
}

export function buildSeed(): Seed {
  const rnd = mulberry32(20261016)
  const pick = <T,>(arr: ReadonlyArray<T>): T => arr[Math.floor(rnd() * arr.length)]!
  const name = () => `${pick(FIRST)} ${pick(LAST)}`
  const code = () => `TF-${Array.from({ length: 4 }, () => pick([...CODE_ALPHABET])).join('')}-${Array.from({ length: 4 }, () => pick([...CODE_ALPHABET])).join('')}`

  const events: StoredEvent[] = []
  const lots: OrgLot[] = []
  const orders: OrgOrder[] = []
  const tickets: OrgTicketRec[] = []
  const now = Date.now()
  const DAY = 86_400_000

  for (const e of EVENTS) {
    const id = `oevt_${e.key}`
    const startsAt = inDays(e.days, e.hh)
    events.push({
      id,
      slug: slugify(e.title),
      title: e.title,
      category: e.cat,
      ageRating: e.age,
      description: e.desc,
      startsAt,
      endsAt: addHours(startsAt, e.hours),
      venue: { name: e.venue, address: e.key === 'neon' ? 'Av. das Nações Unidas, 14401' : '', district: '', city: e.city ?? 'São Paulo', state: 'SP', notes: e.key === 'neon' ? 'Estacionamento no local · Metrô Berrini (700 m) · Acessível' : '' },
      coverName: null,
      hasSeatMap: !!e.seated,
      seatMap: e.seated ? seatMapFor(e) : null,
      cancellationPolicy: 'full-7d',
      status: e.status,
      createdAt: inDays(-70, '10:00'),
      updatedAt: inDays(-2, '15:30'),
    })

    // Assentos por setor (sorteados sem repetição).
    const seatPool: Record<string, string[]> = { premium: [], standard: [] }
    if (e.seated) {
      for (const [ri, letter] of 'ABCDEFGH'.split('').entries()) {
        for (let n = 1; n <= 16; n++) seatPool[ri < 4 ? 'premium' : 'standard']!.push(`${letter}${String(n).padStart(2, '0')}`)
      }
      for (const k of Object.keys(seatPool)) seatPool[k]!.sort(() => rnd() - 0.5)
    }

    const evStartTs = now + e.days * DAY
    for (const [li, l] of e.lots.entries()) {
      const lotId = `olot_${e.key}_${li}`
      lots.push({
        id: lotId,
        eventId: id,
        typeName: l.type,
        name: l.name,
        price: l.price,
        quantity: l.qty,
        sold: l.sold,
        startsAt: day(l.from),
        endsAt: day(l.to),
        perCustomerLimit: 6,
        autoOpenNext: true,
        status: e.status === 'draft' ? 'draft' : 'published',
      })

      const winStart = now + Math.max(l.from, -60) * DAY
      const winEnd = Math.min(now - 60_000, now + l.to * DAY, e.days < 0 ? evStartTs : now)
      const makeOrder = (qty: number, status: OrgOrder['status'], isLast = false) => {
        let ts = winStart + rnd() * Math.max(DAY / 2, winEnd - winStart)
        // Nunca no futuro: o excedente é espalhado nos últimos dias em vez de empilhar no mesmo instante.
        if (ts > now - 60_000) ts = now - 60_000 - rnd() * 3 * DAY
        const method: OrgPaymentMethod = rnd() < 0.5 ? 'card' : rnd() < 0.9 ? 'pix' : 'boleto'
        const buyer = name()
        const subtotal = qty * l.price
        const fee = Math.round(subtotal * 10) / 100
        const idN = orders.length
        const orderId = `oord_${idN}`
        const last4 = method === 'card' ? String(1000 + Math.floor(rnd() * 9000)) : undefined
        orders.push({
          id: orderId,
          code: '',
          eventId: id,
          eventTitle: e.title,
          buyerName: buyer,
          buyerEmail: `${slugify(buyer).replace(/-/g, '.')}@exemplo.com`,
          quantity: qty,
          subtotal,
          fee,
          total: Math.round((subtotal + fee) * 100) / 100,
          paymentMethod: method,
          cardLast4: last4,
          createdAt: new Date(ts).toISOString(),
          status,
          lines: [{ description: `${l.type} · ${l.name}`, quantity: qty, unitPrice: l.price }],
        })
        void isLast
        if (status === 'paid' || status === 'refunded') {
          for (let i = 0; i < qty; i++) {
            const tid = `otkt_${tickets.length}`
            const seat = l.sector ? (seatPool[l.sector]!.pop() ?? null) : null
            tickets.push({
              id: tid,
              code: code(),
              orderId,
              orderCode: '',
              eventId: id,
              lotId,
              typeName: l.type,
              sector: l.sector ? l.type : l.type,
              seat,
              name: i === 0 || rnd() < 0.5 ? buyer : name(),
              email: orders[idN]!.buyerEmail,
              status: status === 'refunded' ? 'cancelled' : 'valid',
            })
          }
        }
      }

      const cancelled = e.status === 'cancelled'
      let left = l.sold
      while (left > 0) {
        const qty = Math.min(left, pick([1, 1, 2, 2, 2, 3, 4]))
        makeOrder(qty, cancelled ? 'refunded' : 'paid')
        left -= qty
      }
      if (!cancelled && l.sold > 20) {
        const extra = (n: number, st: OrgOrder['status']) => { for (let i = 0; i < n; i++) makeOrder(pick([1, 2, 3]), st) }
        extra(Math.max(1, Math.round(l.sold / 70)), 'pending')
        extra(Math.max(1, Math.round(l.sold / 90)), 'declined')
        extra(Math.max(1, Math.round(l.sold / 120)), 'refunded')
      }
    }

    // Check-ins semeados.
    if (e.checkin) {
      const own = tickets.filter((t) => t.eventId === id && t.status === 'valid')
      const n = Math.round(own.length * e.checkin)
      own.slice(0, n).forEach((t, i) => {
        const base = e.days < 0 ? new Date(startsAt).getTime() : now - 3 * 3_600_000
        t.checkedInAt = new Date(base + i * (e.days < 0 ? 18_000 : 12_000) + rnd() * 5000).toISOString()
        t.gate = pick(['Portão A', 'Portão B', 'Portão C'])
      })
    }
  }

  // Códigos de pedido em ordem cronológica: o mais novo termina perto de TF-48213.
  orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const codeByOrder = new Map<string, string>()
  const start = 48213 - orders.length + 1
  orders.forEach((o, i) => {
    o.code = `TF-${start + i}`
    codeByOrder.set(o.id, o.code)
  })
  for (const t of tickets) t.orderCode = codeByOrder.get(t.orderId) ?? ''
  orders.reverse() // mais recentes primeiro

  const settings: OrgSettings = {
    name: 'Pulse Produções',
    document: '12.345.678/0001-90',
    email: 'contato@pulseproducoes.com.br',
    phone: '(11) 3000-1234',
    payout: { bank: '341 · Itaú', agency: '0001', account: '12345-6', holder: 'Pulse Produções Ltda' },
    members: [
      { id: 'mem_1', name: 'Rafael Souza', email: 'organizador@pulse.com', role: 'OWNER' },
      { id: 'mem_2', name: 'Marina Lopes', email: 'marina@pulseproducoes.com.br', role: 'MANAGER' },
      { id: 'mem_3', name: 'Portaria — Portão A', email: 'portaria@pulseproducoes.com.br', role: 'CHECKIN' },
    ],
    webhooks: [{ id: 'wh_1', url: 'https://erp.pulseproducoes.com.br/hooks/ticketflow', events: ['order.paid', 'order.refunded'], active: true }],
  }

  const notices: OrgNotice[] = [
    { id: 'n1', title: 'Lote esgotado', body: 'Pista · 1º lote de Neon Horizon Festival esgotou. O 2º lote abriu automaticamente.', at: inDays(-1, '14:10'), read: false, href: '/org/eventos/oevt_neon' },
    { id: 'n2', title: 'Pagamento recusado', body: 'Helena Prado teve um pagamento recusado em Growth Conference.', at: inDays(0, '08:30'), read: false, href: '/org/pedidos' },
    { id: 'n3', title: 'Rascunhos pendentes', body: 'Festival do Sabor e Hackathon Climate Tech ainda estão em rascunho.', at: inDays(-3, '09:00'), read: true, href: '/org/eventos' },
    { id: 'n4', title: 'Repasse agendado', body: 'O repasse de Rock na Fábrica 2025 será depositado em 3 dias úteis.', at: inDays(-5, '17:45'), read: true },
  ]

  return { events, lots, orders, tickets, settings, notices }
}
