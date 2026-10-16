import type { EventSort, WhenFilter } from '@/types/event'

/** Cidades atendidas. No backend real virá de um endpoint de localidades. */
export const CITIES = [
  'São Paulo, SP',
  'Rio de Janeiro, RJ',
  'Belo Horizonte, MG',
  'Curitiba, PR',
] as const

export const DEFAULT_CITY = 'São Paulo, SP'

export const SORT_OPTIONS: ReadonlyArray<{ value: EventSort; label: string }> = [
  { value: 'data', label: 'Data mais próxima' },
  { value: 'recentes', label: 'Mais recentes' },
  { value: 'preco', label: 'Menor preço' },
  { value: 'distancia', label: 'Mais próximos' },
]

export const WHEN_OPTIONS: ReadonlyArray<{ value: WhenFilter; label: string; short: string }> = [
  { value: 'hoje', label: 'Hoje', short: 'Hoje' },
  { value: 'fim-de-semana', label: 'Este fim de semana', short: 'Fim de semana' },
  { value: 'mes', label: 'Este mês', short: 'Este mês' },
]

/** Domínio do slider de preço (R$). Valores nas pontas = sem limite. */
export const PRICE_RANGE = { min: 0, max: 300, step: 10 } as const
