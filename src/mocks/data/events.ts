import { normalize } from '@/lib/text'
import type {
  CategorySlug,
  EventBadge,
  EventDetail,
  PolicyItem,
  ScheduleItem,
} from '@/types/event'
import { CATEGORY_DEFS } from './categories'
import { addHours, inDays, nextWeekend } from './dates'

interface Row {
  title: string
  cat: CategorySlug
  at: string
  venue: string
  city: string
  state: string
  km: number | null
  price: number
  org: string
  desc?: string
  badges?: EventBadge[]
  seats?: boolean
  featured?: boolean
  age?: number
  sub?: string
}

const SP = { city: 'São Paulo', state: 'SP' }

/* A ordem das linhas define "mais recentes" (índice maior = mais novo). */
const ROWS: Row[] = [
  { title: 'Neon Horizon Festival', cat: 'musica', at: inDays(8, '20:00'), venue: 'Centro de Eventos', ...SP, km: 2.4, price: 80, org: 'Pulse Produções', badges: ['lastTickets'], seats: true, featured: true, age: 18, sub: 'Festival', desc: 'Doze horas de música eletrônica, live acts e arte audiovisual em dois palcos. Pista, VIP e camarotes com visão frontal do palco principal.' },
  { title: 'DevSummit Brasil 2026', cat: 'tecnologia', at: inDays(22, '09:00'), venue: 'Expo Center Norte', ...SP, km: 6.1, price: 120, org: 'DevSummit', badges: ['lastTickets'], featured: true, age: 0, sub: 'Conferência', desc: 'Dois dias de palestras, workshops e networking sobre engenharia de software, IA aplicada e plataformas.' },
  { title: 'Clássico no Morumbi', cat: 'esportes', at: inDays(30, '16:00'), venue: 'Estádio do Morumbi', ...SP, km: 8.7, price: 60, org: 'Liga Paulista', badges: ['lastTickets'], seats: true, featured: true, age: 0, sub: 'Futebol', desc: 'O maior clássico do estado com arquibancadas numeradas e setores a preços populares.' },
  { title: 'Noites de Jazz na Praça', cat: 'cultura', at: inDays(13, '19:30'), venue: 'Praça Roosevelt', ...SP, km: 3.3, price: 45, org: 'Coletivo Praça Viva', seats: true, featured: true, age: 14, sub: 'Show', desc: 'Quartetos e big bands ocupam a praça numa série de noites ao ar livre.' },
  /* Evento com dados ausentes de propósito: sem descrição, programação, endereço e política. */
  { title: 'Festival do Sabor', cat: 'gastronomia', at: inDays(50, '12:00'), venue: 'Parque Ibirapuera', ...SP, km: 5.0, price: 35, org: 'Sabor & Cia', badges: ['lastTickets'], featured: true },
  { title: 'Growth Conference', cat: 'negocios', at: inDays(57, '08:30'), venue: 'Hotel Unique', ...SP, km: 4.2, price: 290, org: 'Growth Hub', featured: true, age: 16, sub: 'Conferência', desc: 'Casos reais de crescimento, vendas e produto contados por quem executou.' },
  { title: 'Rock na Fábrica', cat: 'musica', at: inDays(3, '21:00'), venue: 'Fábrica de Cultura', ...SP, km: 7.8, price: 55, org: 'Rock Cia', age: 16, desc: 'Cinco bandas autorais num galpão industrial, com som de estádio e preço de bar.' },
  { title: 'Samba de Raiz no Bixiga', cat: 'musica', at: inDays(0, '23:00'), venue: 'Casa do Samba', ...SP, km: 1.9, price: 30, org: 'Roda Viva', age: 18, desc: 'Roda de samba com repertório tradicional e convidados especiais até de madrugada.' },
  { title: 'Corrida Noturna 10K', cat: 'esportes', at: nextWeekend('sat', '19:00'), venue: 'Parque da Aclimação', ...SP, km: 3.9, price: 90, org: 'Run SP', age: 0, desc: 'Percurso iluminado de 10 km com kit completo, medalha e hidratação em todo o trajeto.' },
  { title: 'Stand-up Night', cat: 'cultura', at: nextWeekend('sun', '18:00'), venue: 'Teatro Renault', ...SP, km: 6.6, price: 70, org: 'Risada Livre', seats: true, age: 16, desc: 'Cinco comediantes, uma noite: o melhor do stand-up nacional em formato de maratona.' },
  { title: 'Feira Gastronômica da Liberdade', cat: 'gastronomia', at: nextWeekend('sat', '11:00'), venue: 'Praça da Liberdade', ...SP, km: 2.1, price: 20, org: 'Bairro Oriental', age: 0, desc: 'Barracas com culinária japonesa, coreana e chinesa, degustações e shows de taiko.' },
  { title: 'AI Builders Meetup', cat: 'tecnologia', at: inDays(5, '19:00'), venue: 'Cubo Coworking', ...SP, km: 4.8, price: 0, org: 'AI Builders', age: 0, desc: 'Encontro gratuito para quem constrói produtos com IA: demos de 5 minutos e conversas abertas.' },
  { title: 'Final do Paulista de Vôlei', cat: 'esportes', at: inDays(18, '15:00'), venue: 'Ginásio do Ibirapuera', ...SP, km: 5.2, price: 40, org: 'Federação Paulista', badges: ['soldOut'], seats: true, age: 0, desc: 'Decisão do campeonato com ginásio lotado. Ingressos esgotados — acompanhe a lista de espera.' },
  { title: 'Exposição Luz e Sombra', cat: 'cultura', at: inDays(9, '10:00'), venue: 'MASP', ...SP, km: 3.0, price: 50, org: 'MASP', age: 0, desc: 'Mostra com 120 obras sobre fotografia, contraste e a construção da imagem em preto e branco.' },
  { title: 'Pitch Day Startups', cat: 'negocios', at: inDays(12, '14:00'), venue: 'WeWork Faria Lima', ...SP, km: 6.9, price: 90, org: 'Capital Semente', age: 18, desc: 'Vinte startups apresentam para investidores e para a plateia. Rodadas de networking ao final.' },
  { title: 'Noite do Vinho', cat: 'gastronomia', at: inDays(20, '20:00'), venue: 'Adega Vila Madalena', ...SP, km: 5.7, price: 150, org: 'Confraria do Vinho', age: 18, desc: 'Degustação guiada de doze rótulos com harmonização e sommelier convidado.' },
  { title: 'Orquestra Sinfônica: Beethoven', cat: 'musica', at: inDays(26, '20:30'), venue: 'Sala São Paulo', ...SP, km: 4.4, price: 120, org: 'Osesp', seats: true, age: 0, desc: 'Sinfonias nº 5 e nº 7 sob regência convidada, em uma das melhores acústicas do país.' },
  { title: 'Hackathon Climate Tech', cat: 'tecnologia', at: inDays(35, '09:00'), venue: 'Insper', ...SP, km: 9.4, price: 25, org: 'Climate Lab', age: 16, desc: 'Trinta e seis horas para prototipar soluções de dados e energia limpa, com mentoria.' },
  { title: 'Rio Sunset Festival', cat: 'musica', at: inDays(15, '17:00'), venue: 'Parque Olímpico', city: 'Rio de Janeiro', state: 'RJ', km: null, price: 220, org: 'Sunset Co.', badges: ['lastTickets'], seats: true, age: 18, desc: 'Pôr do sol, três palcos e line-up de música brasileira e eletrônica.' },
  { title: 'Meia Maratona do Rio', cat: 'esportes', at: inDays(40, '06:00'), venue: 'Aterro do Flamengo', city: 'Rio de Janeiro', state: 'RJ', km: null, price: 140, org: 'Rio Corre', age: 0, desc: '21 km com vista para a baía. Kit do atleta, chip de cronometragem e medalha.' },
  { title: 'Festival de Cinema Carioca', cat: 'cultura', at: inDays(24, '18:00'), venue: 'Cine Odeon', city: 'Rio de Janeiro', state: 'RJ', km: null, price: 30, org: 'Cine Rio', age: 12, desc: 'Mostra competitiva de curtas e longas independentes com debates com diretores.' },
  { title: 'BH Tech Fest', cat: 'tecnologia', at: inDays(28, '09:00'), venue: 'Expominas', city: 'Belo Horizonte', state: 'MG', km: null, price: 180, org: 'BH Digital', age: 0, desc: 'O maior encontro de tecnologia de Minas, com trilhas de dados, produto e infraestrutura.' },
  { title: 'Festival Comida de Buteco', cat: 'gastronomia', at: inDays(11, '12:00'), venue: 'Mercado Central', city: 'Belo Horizonte', state: 'MG', km: null, price: 25, org: 'Buteco BH', age: 0, desc: 'Pratos autorais de botecos da cidade num só lugar, com votação do público.' },
  { title: 'Curitiba Jazz Sessions', cat: 'musica', at: inDays(16, '20:00'), venue: 'Ópera de Arame', city: 'Curitiba', state: 'PR', km: null, price: 85, org: 'Jazz Sul', seats: true, age: 12, desc: 'Noite de jazz sob a cobertura de vidro da Ópera de Arame.' },
  { title: 'Summit de Liderança', cat: 'negocios', at: inDays(33, '08:00'), venue: 'Expo Unimed', city: 'Curitiba', state: 'PR', km: null, price: 340, org: 'Líderes do Sul', age: 18, desc: 'Um dia de palestras e mentorias com líderes de empresas de médio e grande porte.' },
  { title: 'Atletiba', cat: 'esportes', at: inDays(21, '16:00'), venue: 'Ligga Arena', city: 'Curitiba', state: 'PR', km: null, price: 70, org: 'Federação Paranaense', badges: ['lastTickets'], seats: true, age: 0, desc: 'O clássico paranaense numa arena de bolso: torcida colada ao gramado.' },
]

export const slugify = (value: string): string =>
  normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const categoryName = (slug: CategorySlug): string =>
  CATEGORY_DEFS.find((c) => c.slug === slug)?.name ?? slug

const DEFAULT_POLICY: PolicyItem[] = [
  {
    title: 'Reembolso integral até 7 dias após a compra',
    body: 'Você pode cancelar a compra em até 7 dias e receber o valor integral, desde que o pedido seja feito com mais de 48 horas de antecedência do evento.',
  },
  {
    title: 'Cancelamento do evento pelo organizador',
    body: 'Se o evento for cancelado, o valor dos ingressos e a taxa de serviço são devolvidos integralmente, pelo mesmo meio de pagamento, em até 5 dias úteis.',
  },
]

const NEON_SCHEDULE: ScheduleItem[] = [
  { time: '20:00', title: 'Abertura dos portões' },
  { time: '21:30', title: 'Aurora Kei (live)', location: 'Palco Principal' },
  { time: '23:30', title: 'Dual Signal', location: 'Palco Principal' },
  { time: '01:30', title: 'Headliner a anunciar', location: 'Palco Principal' },
]

function defaultSchedule(startsAt: string): ScheduleItem[] {
  return [
    { time: startsAt.slice(11, 16), title: 'Abertura dos portões' },
    { time: addHours(startsAt, 1).slice(11, 16), title: 'Início da programação' },
  ]
}

function build(row: Row, index: number): EventDetail {
  const isNeon = index === 0
  const isSparse = row.desc === undefined
  const soldOut = row.badges?.includes('soldOut') ?? false
  const free = row.price === 0

  return {
    id: `evt_${String(index + 1).padStart(3, '0')}`,
    slug: slugify(row.title),
    title: row.title,
    category: { slug: row.cat, name: categoryName(row.cat) },
    startsAt: row.at,
    endsAt: isNeon ? addHours(row.at, 10) : undefined,
    venue: {
      name: row.venue,
      city: row.city,
      state: row.state,
      distanceKm: row.km,
      address: isNeon ? 'Av. das Nações Unidas, 14401' : undefined,
      district: isNeon ? 'Vila Gertrudes, São Paulo – SP' : undefined,
      notes: isNeon ? 'Estacionamento no local · Metrô Berrini (700 m) · Acessível' : undefined,
    },
    minPrice: row.price,
    coverUrl: null,
    badges: row.badges ?? [],
    hasSeatMap: row.seats ?? false,
    subtitle: row.sub,
    organizer: row.org,
    description: row.desc,
    ageRating: row.age,
    schedule: isSparse ? [] : isNeon ? NEON_SCHEDULE : defaultSchedule(row.at),
    cancellationPolicy: isSparse ? [] : DEFAULT_POLICY,
    lot: soldOut || free
      ? undefined
      : isNeon
        ? { name: '2º lote', remaining: 312 }
        : { name: '1º lote', remaining: row.badges?.includes('lastTickets') ? 24 + index : 120 + index * 7 },
    serviceFeePct: free ? 0 : 10,
  }
}

export const EVENTS: EventDetail[] = ROWS.map(build)

/** Slugs de destaque, na ordem do protótipo. */
export const FEATURED_SLUGS: string[] = ROWS.flatMap((r, i) => (r.featured ? [EVENTS[i]!.slug] : []))

/** Posição de cadastro (maior = mais recente). */
export const CREATED_ORDER: Record<string, number> = Object.fromEntries(
  EVENTS.map((e, i) => [e.id, i]),
)
