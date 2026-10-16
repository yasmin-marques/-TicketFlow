import type { CategorySlug } from '@/types/event'

export const CATEGORY_OPTIONS: ReadonlyArray<{ value: CategorySlug; label: string }> = [
  { value: 'musica', label: 'Música' },
  { value: 'tecnologia', label: 'Tecnologia' },
  { value: 'esportes', label: 'Esportes' },
  { value: 'cultura', label: 'Cultura' },
  { value: 'gastronomia', label: 'Gastronomia' },
  { value: 'negocios', label: 'Negócios' },
]

export const WIZARD_STEPS = ['Informações', 'Local', 'Ingressos', 'Assentos', 'Publicação'] as const
