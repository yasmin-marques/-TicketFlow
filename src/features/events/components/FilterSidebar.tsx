import type { Category } from '@/types/event'
import { FilterFields, type FilterValues } from './FilterFields'

interface FilterSidebarProps {
  values: FilterValues
  onChange: (patch: Partial<FilterValues>) => void
  onClear: () => void
  categories: Category[] | undefined
}

/** Coluna de filtros de 272px (desktop). Aplica na hora. */
export function FilterSidebar({ values, onChange, onClear, categories }: FilterSidebarProps) {
  return (
    <aside aria-label="Filtros" className="surface p-6">
      <div className="mb-[22px] flex items-baseline justify-between">
        <h2 className="m-0 text-[13px] tracking-[0.08em] uppercase">Filtros</h2>
        <button type="button" onClick={onClear} className="transition-control rounded-sm px-1.5 py-0.5 text-[13px] font-semibold text-accent-700 hover:bg-accent/8">
          Limpar
        </button>
      </div>
      <FilterFields variant="sidebar" values={values} onChange={onChange} categories={categories} />
    </aside>
  )
}
