export type CategorySlug =
  | 'musica'
  | 'tecnologia'
  | 'esportes'
  | 'cultura'
  | 'gastronomia'
  | 'negocios'

export interface Category {
  slug: CategorySlug
  name: string
  /** Quantidade de eventos publicados na categoria. */
  eventCount: number
}

export type EventBadge = 'lastTickets' | 'soldOut'

export interface VenueSummary {
  name: string
  city: string
  state: string
  /** Distância até a localização do usuário. `null` quando indisponível. */
  distanceKm: number | null
}

/** Dados exibidos em cards e listagens. */
export interface EventSummary {
  id: string
  slug: string
  title: string
  category: Pick<Category, 'slug' | 'name'>
  /** ISO 8601 com offset. */
  startsAt: string
  venue: VenueSummary
  /** Menor preço de ingresso em reais. `null` quando as vendas não abriram. */
  minPrice: number | null
  coverUrl: string | null
  badges: EventBadge[]
  hasSeatMap: boolean
}

export interface ScheduleItem {
  time: string
  title: string
  location?: string
}

export interface PolicyItem {
  title: string
  body: string
}

export interface VenueDetail extends VenueSummary {
  address?: string
  district?: string
  /** Comodidades e acesso: estacionamento, metrô, acessibilidade. */
  notes?: string
}

export interface TicketLotInfo {
  /** Ex.: "2º lote". */
  name: string
  remaining: number
}

/** Dados completos da página do evento. Campos opcionais podem faltar. */
export interface EventDetail extends Omit<EventSummary, 'venue'> {
  venue: VenueDetail
  /** Ex.: "Festival". */
  subtitle?: string
  organizer: string
  description?: string
  /** ISO 8601 com offset. */
  endsAt?: string
  /** Classificação indicativa em anos; `0` = livre. */
  ageRating?: number
  schedule: ScheduleItem[]
  cancellationPolicy: PolicyItem[]
  lot?: TicketLotInfo
  /** Taxa de serviço em % sobre o valor do ingresso. */
  serviceFeePct: number
}

export type EventSort = 'data' | 'recentes' | 'preco' | 'distancia'
export type WhenFilter = 'hoje' | 'fim-de-semana' | 'mes'

export interface EventFilters {
  q: string
  /** Cidade ("São Paulo, SP"); vazio = todas. */
  city: string
  /** YYYY-MM-DD */
  from: string
  /** YYYY-MM-DD */
  to: string
  categories: CategorySlug[]
  minPrice: number | null
  maxPrice: number | null
  when: WhenFilter | null
  seatMapOnly: boolean
  sort: EventSort
  page: number
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface Suggestion {
  slug: string
  title: string
  category: string
  venue: string
}
