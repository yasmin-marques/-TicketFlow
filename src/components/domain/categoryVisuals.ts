import { Briefcase, Cpu, Drama, Music, Trophy, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import type { CategorySlug } from '@/types/event'

export interface CategoryVisual {
  icon: LucideIcon
  /** Gradiente da capa de fallback (só cores da paleta). */
  gradient: string
  /** Fundo suave do ícone nos tiles de categoria. */
  tint: string
}

/**
 * Identidade visual de cada categoria: um ícone e um gradiente construídos só
 * com a paleta do TicketFlow. Usado nos tiles de categoria e na capa de
 * fallback dos eventos sem imagem.
 */
export const CATEGORY_VISUALS: Record<CategorySlug, CategoryVisual> = {
  musica: {
    icon: Music,
    gradient: 'linear-gradient(135deg, var(--color-accent-700) 0%, var(--color-accent) 55%, var(--color-accent-2-400) 100%)',
    tint: 'bg-accent-100 text-accent-700',
  },
  tecnologia: {
    icon: Cpu,
    gradient: 'linear-gradient(135deg, var(--color-text) 0%, var(--color-neutral-800) 60%, var(--color-accent-800) 100%)',
    tint: 'bg-neutral-200 text-neutral-900',
  },
  esportes: {
    icon: Trophy,
    gradient: 'linear-gradient(135deg, var(--color-accent-900) 0%, var(--color-accent-700) 50%, var(--color-accent-500) 100%)',
    tint: 'bg-accent-200 text-accent-800',
  },
  cultura: {
    icon: Drama,
    gradient: 'linear-gradient(135deg, var(--color-accent-2-800) 0%, var(--color-accent-2-600) 55%, var(--color-accent-2-300) 100%)',
    tint: 'bg-accent-2-100 text-accent-2-700',
  },
  gastronomia: {
    icon: UtensilsCrossed,
    gradient: 'linear-gradient(135deg, var(--color-accent-2-600) 0%, var(--color-accent-2-500) 45%, var(--color-accent-300) 100%)',
    tint: 'bg-accent-2-200 text-accent-2-800',
  },
  negocios: {
    icon: Briefcase,
    gradient: 'linear-gradient(135deg, var(--color-neutral-900) 0%, var(--color-neutral-700) 60%, var(--color-neutral-500) 100%)',
    tint: 'bg-neutral-200 text-neutral-800',
  },
}

/** Visual de uma categoria; categorias novas do backend caem no visual neutro. */
export function categoryVisual(slug: string | undefined): CategoryVisual {
  return CATEGORY_VISUALS[slug as CategorySlug] ?? CATEGORY_VISUALS.negocios
}
