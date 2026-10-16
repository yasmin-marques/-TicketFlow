import type { CategorySlug } from '@/types/event'

export const CATEGORY_DEFS: ReadonlyArray<{ slug: CategorySlug; name: string }> = [
  { slug: 'musica', name: 'Música' },
  { slug: 'tecnologia', name: 'Tecnologia' },
  { slug: 'esportes', name: 'Esportes' },
  { slug: 'cultura', name: 'Cultura' },
  { slug: 'gastronomia', name: 'Gastronomia' },
  { slug: 'negocios', name: 'Negócios' },
]
