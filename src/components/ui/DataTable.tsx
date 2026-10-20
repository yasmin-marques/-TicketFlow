import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Skeleton } from './Skeleton'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  align?: 'left' | 'right'
  className?: string
  /** Esconde a coluna abaixo de `lg`. */
  hideOnMobile?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[] | undefined
  rowKey: (row: T) => string
  loading?: boolean
  /** Caption acessível. */
  caption: string
  onRowClick?: (row: T) => void
  /** Representação em cartão para telas pequenas (se ausente, rola na horizontal). */
  mobileCard?: (row: T) => ReactNode
  skeletonRows?: number
}

/** Tabela do painel: cabeçalho em caixa-alta, réguas finas, hover de 4%, skeleton embutido. */
export function DataTable<T>({ columns, rows, rowKey, loading, caption, onRowClick, mobileCard, skeletonRows = 6 }: DataTableProps<T>) {
  const th = 'border-b border-divider bg-neutral-100/70 px-3 py-2.5 text-[11px] font-semibold tracking-[0.08em] text-text/60 uppercase'
  return (
    <>
      {mobileCard && (
        <ul className="m-0 list-none p-0 lg:hidden" aria-label={caption}>
          {loading
            ? Array.from({ length: skeletonRows }, (_, i) => <Skeleton key={i} className="mb-2 h-16 rounded-card" />)
            : rows?.map((r) => (
                <li key={rowKey(r)} className="surface mb-2 px-3.5 py-3">
                  {mobileCard(r)}
                </li>
              ))}
        </ul>
      )}
      <div className={cn('surface overflow-x-auto', mobileCard && 'max-lg:hidden')}>
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn(th, c.align === 'right' ? 'text-right' : 'text-left', c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: skeletonRows }, (_, i) => (
                  <tr key={i} aria-hidden>
                    {columns.map((c) => (
                      <td key={c.key} className="border-b border-line px-3 py-2.5">
                        <Skeleton className="h-4 w-4/5" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows?.map((r) => (
                  <tr
                    key={rowKey(r)}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={cn('border-b border-line transition-colors last:border-b-0 hover:bg-text/3', onRowClick && 'cursor-pointer')}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-3 py-2.5 align-middle', c.align === 'right' && 'text-right', c.className)}>
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
