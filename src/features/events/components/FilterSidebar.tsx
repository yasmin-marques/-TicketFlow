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
    <aside aria-label="Filtros" className="border-r-2 border-divider px-7 py-6">
      <div className="mb-[22px] flex items-baseline justify-between">
        <h2 className="m-0 text-[13px] tracking-[0.08em] uppercase">Filtros</h2>
        <button type="button" onClick={onClear} className="text-[13px] text-accent underline underline-offset-[3px] hover:text-accent-700">
          Limpar
        </button>
      </div>
      <FilterFields variant="sidebar" values={values} onChange={onChange} categories={categories} />
    </aside>
  )
}
