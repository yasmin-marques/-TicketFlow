import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { pluralize } from '@/lib/format'
import type { Category } from '@/types/event'
import { categoryVisual } from './categoryVisuals'

/** Card da grade de categorias da home: ícone da categoria, nome e contagem. */
export function CategoryTile({ category }: { category: Category }) {
  const { icon: Icon, tint } = categoryVisual(category.slug)
  return (
    <Link
      to={`/categorias/${category.slug}`}
      className="surface surface-hover group flex min-h-[132px] flex-col justify-between gap-4 p-5 text-text no-underline lg:p-6"
    >
      <span className="flex items-start justify-between gap-3">
        <span aria-hidden className={cn('grid size-11 place-items-center rounded-control transition-transform duration-200 group-hover:scale-105', tint)}>
          <Icon size={20} strokeWidth={2.2} />
        </span>
        <ArrowUpRight
          size={18}
          aria-hidden
          className="text-neutral-500 transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent-700"
        />
      </span>
      <span>
        <span className="block text-[24px] leading-none font-extrabold tracking-[-0.025em] sm:text-[28px]">{category.name}</span>
        <span className="text-muted tabular mt-1.5 block text-xs font-semibold">
          {pluralize(category.eventCount, 'evento', 'eventos')}
        </span>
      </span>
    </Link>
  )
}
