import { SlidersHorizontal } from 'lucide-react'
import { Chip } from '@/components/ui/Chip'
import { Select } from '@/components/ui/Select'
import { formatDateRange, formatPrice, pluralize } from '@/lib/format'
import type { Category, EventFilters, EventSort } from '@/types/event'
import { PRICE_RANGE, SORT_OPTIONS, WHEN_OPTIONS } from '../constants'

interface ResultsToolbarProps {
  total: number | undefined
  filters: EventFilters
  defaultCategories: EventFilters['categories']
  categories: Category[] | undefined
  activeCount: number
  onChange: (patch: Partial<EventFilters>) => void
  onOpenFilters: () => void
}

interface ActiveChip {
  key: string
  label: string
  remove: Partial<EventFilters>
}

function buildChips(
  filters: EventFilters,
  defaultCategories: EventFilters['categories'],
  categories: Category[] | undefined,
): ActiveChip[] {
  const chips: ActiveChip[] = []
  const isDefaultSet =
    filters.categories.length === defaultCategories.length &&
    filters.categories.every((c) => defaultCategories.includes(c))

  if (!isDefaultSet) {
    for (const slug of filters.categories) {
      chips.push({
        key: `cat-${slug}`,
        label: categories?.find((c) => c.slug === slug)?.name ?? slug,
        remove: { categories: filters.categories.filter((c) => c !== slug) },
      })
    }
  }
  if (filters.minPrice !== null || filters.maxPrice !== null) {
    const lo = filters.minPrice ?? PRICE_RANGE.min
    const hi = filters.maxPrice
    chips.push({
      key: 'price',
      label: hi === null ? `A partir de ${formatPrice(lo)}` : `${formatPrice(lo)}–${hi.toLocaleString('pt-BR')}`,
      remove: { minPrice: null, maxPrice: null },
    })
  }
  if (filters.when) {
    chips.push({
      key: 'when',
      label: WHEN_OPTIONS.find((o) => o.value === filters.when)?.label ?? filters.when,
      remove: { when: null },
    })
  }
  if (filters.from || filters.to) {
    chips.push({ key: 'date', label: formatDateRange(filters.from, filters.to), remove: { from: '', to: '' } })
  }
  if (filters.seatMapOnly) {
    chips.push({ key: 'seat', label: 'Assento marcado', remove: { seatMapOnly: false } })
  }
  return chips
}

/** Linha acima dos resultados: total, filtros ativos removíveis, ordenação e (mobile) botão Filtros. */
export function ResultsToolbar({
  total,
  filters,
  defaultCategories,
  categories,
  activeCount,
  onChange,
  onOpenFilters,
}: ResultsToolbarProps) {
  const chips = buildChips(filters, defaultCategories, categories)

  return (
    <div className="mb-[18px] flex flex-wrap items-center gap-x-2.5 gap-y-2">
      <b className="tabular mr-1 text-[15px]" aria-live="polite">
        {total === undefined ? 'Buscando…' : pluralize(total, 'evento', 'eventos')}
      </b>

      <button
        type="button"
        onClick={onOpenFilters}
        className="transition-control ml-auto inline-flex items-center gap-1.5 rounded-full border border-divider bg-card px-3.5 py-1.5 text-sm font-semibold shadow-xs active:scale-[0.97] lg:hidden"
      >
        <SlidersHorizontal size={14} aria-hidden />
        Filtros{activeCount > 0 && ` · ${activeCount}`}
      </button>

      <div className="order-last flex w-full flex-wrap gap-2 lg:order-none lg:w-auto">
        {chips.map((c) => (
          <Chip key={c.key} label={c.label} size="sm" removable onClick={() => onChange(c.remove)} />
        ))}
      </div>

      <Select<EventSort>
        value={filters.sort}
        onChange={(sort) => onChange({ sort })}
        prefix="Ordenar:"
        aria-label="Ordenar eventos"
        options={SORT_OPTIONS}
        className="lg:ml-auto"
      />
    </div>
  )
}
