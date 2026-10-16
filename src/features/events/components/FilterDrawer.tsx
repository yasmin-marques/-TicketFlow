import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { pluralize } from '@/lib/format'
import type { Category, EventFilters } from '@/types/event'
import { useEventList } from '../hooks'
import { FilterFields, type FilterValues } from './FilterFields'

interface FilterDrawerProps {
  open: boolean
  onClose: () => void
  filters: EventFilters
  defaults: { city: string; categories: EventFilters['categories'] }
  categories: Category[] | undefined
  onApply: (values: FilterValues) => void
}

const pick = (f: EventFilters): FilterValues => ({
  city: f.city,
  from: f.from,
  to: f.to,
  categories: f.categories,
  minPrice: f.minPrice,
  maxPrice: f.maxPrice,
  when: f.when,
  seatMapOnly: f.seatMapOnly,
})

/** Filtros no mobile: edita um rascunho, mostra a contagem ao vivo e aplica no botão. */
export function FilterDrawer({ open, onClose, filters, defaults, categories, onApply }: FilterDrawerProps) {
  const [draft, setDraft] = useState<FilterValues>(() => pick(filters))

  // Ao abrir, parte dos filtros atuais.
  useEffect(() => {
    if (open) setDraft(pick(filters))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isFetching } = useEventList({ ...filters, ...draft, page: 1 }, open)

  const clear = () =>
    setDraft({
      city: defaults.city,
      from: '',
      to: '',
      categories: defaults.categories,
      minPrice: null,
      maxPrice: null,
      when: null,
      seatMapOnly: false,
    })

  return (
    <Drawer open={open} onClose={onClose} title="Filtros">
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 text-xl">Filtros</h2>
        <button type="button" onClick={clear} className="text-[13px] text-accent underline underline-offset-[3px]">
          Limpar
        </button>
      </div>
      <FilterFields variant="drawer" values={draft} categories={categories} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
      <Button
        block
        size="xl"
        className="mt-6"
        onClick={() => {
          onApply(draft)
          onClose()
        }}
      >
        {data ? `Ver ${pluralize(data.total, 'evento', 'eventos')}` : 'Ver eventos'}
        {isFetching && <span className="sr-only"> (atualizando)</span>}
      </Button>
    </Drawer>
  )
}
