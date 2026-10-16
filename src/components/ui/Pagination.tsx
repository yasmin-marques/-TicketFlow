import { cn } from '@/lib/cn'

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onChange: (page: number) => void
  className?: string
}

/** Páginas visíveis: 1 … atual±1 … última. */
function pageList(page: number, totalPages: number): Array<number | 'gap'> {
  const set = new Set([1, totalPages, page - 1, page, page + 1])
  const pages = [...set].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  const out: Array<number | 'gap'> = []
  pages.forEach((p, i) => {
    const prev = pages[i - 1]
    if (prev !== undefined && p - prev > 1) out.push('gap')
    out.push(p)
  })
  return out
}

const cell = 'flex h-[34px] min-w-[34px] items-center justify-center'

export function Pagination({ page, totalPages, total, pageSize, onChange, className }: PaginationProps) {
  if (total === 0) return null
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <nav
      aria-label="Paginação"
      className={cn(
        'mt-8 flex flex-wrap items-center justify-between gap-3 border-t-2 border-divider pt-4 text-sm font-semibold',
        className,
      )}
    >
      <span className="text-muted tabular">
        {first}–{last} de {total.toLocaleString('pt-BR')}
      </span>
      {totalPages > 1 && (
        <ul className="flex gap-1">
          {pageList(page, totalPages).map((p, i) =>
            p === 'gap' ? (
              <li key={`gap-${i}`} aria-hidden className={cn(cell, 'text-muted')}>
                …
              </li>
            ) : (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => onChange(p)}
                  aria-label={`Página ${p}`}
                  aria-current={p === page ? 'page' : undefined}
                  className={cn(
                    cell,
                    'tabular transition-colors',
                    p === page ? 'bg-text text-bg' : 'border border-divider hover:bg-text/7',
                  )}
                >
                  {p}
                </button>
              </li>
            ),
          )}
          {page < totalPages && (
            <li>
              <button
                type="button"
                onClick={() => onChange(page + 1)}
                className={cn(cell, 'border border-divider px-3 transition-colors hover:bg-text/7')}
              >
                Próxima →
              </button>
            </li>
          )}
        </ul>
      )}
    </nav>
  )
}
