import { Link } from 'react-router-dom'
import { pluralize } from '@/lib/format'
import type { Category } from '@/types/event'

/** Célula da grade de categorias da home. */
export function CategoryTile({ category }: { category: Category }) {
  return (
    <Link
      to={`/categorias/${category.slug}`}
      className="group flex min-h-[110px] items-end justify-between gap-3 bg-bg px-[22px] pt-[22px] pb-[26px] text-text no-underline transition-colors hover:bg-surface"
    >
      <span className="text-[26px] leading-none font-extrabold tracking-[-0.025em] group-hover:text-accent-700 sm:text-[32px]">
        {category.name}
      </span>
      <span className="tabular shrink-0 font-mono text-xs font-semibold">
        {pluralize(category.eventCount, 'evento', 'eventos')} ↗
      </span>
    </Link>
  )
}
