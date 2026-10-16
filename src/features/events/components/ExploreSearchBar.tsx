import { CalendarDays } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Popover } from '@/components/ui/Popover'
import { Select } from '@/components/ui/Select'
import { formatDateRange } from '@/lib/format'
import type { EventFilters } from '@/types/event'
import { CITIES } from '../constants'

type SearchValues = Pick<EventFilters, 'q' | 'city' | 'from' | 'to'>

interface ExploreSearchBarProps {
  values: SearchValues
  onSubmit: (values: SearchValues) => void
}

const label = 'text-muted block text-[10px] font-semibold tracking-[0.1em] uppercase'

/**
 * Barra de busca da exploração. Desktop: 4 células (busca, local, data, botão)
 * com borda de 2px. Mobile: só o campo de busca (local e data ficam no drawer).
 */
export function ExploreSearchBar({ values, onSubmit }: ExploreSearchBarProps) {
  const [draft, setDraft] = useState<SearchValues>(values)
  const inputRef = useRef<HTMLInputElement>(null)
  const { state } = useLocation()

  // Mantém o rascunho alinhado à URL (voltar/avançar, limpar filtros, busca do header).
  useEffect(() => {
    setDraft(values)
  }, [values.q, values.city, values.from, values.to]) // eslint-disable-line react-hooks/exhaustive-deps

  // Vindo do "Buscar" do header mobile.
  useEffect(() => {
    if ((state as { focusSearch?: boolean } | null)?.focusSearch) inputRef.current?.focus()
  }, [state])

  const dateLabel = formatDateRange(draft.from, draft.to)

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ ...draft, q: draft.q.trim() })
      }}
      className="grid border-2 border-text lg:grid-cols-[2fr_1.2fr_1.2fr_auto]"
    >
      <label className="block px-4 py-2.5 lg:border-r lg:border-text">
        <span className={label}>Busca</span>
        <input
          ref={inputRef}
          type="search"
          value={draft.q}
          onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
          placeholder="Eventos, artistas, locais"
          className="block w-full bg-transparent text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-neutral-600"
        />
      </label>

      <label className="hidden px-4 py-2.5 lg:block lg:border-r lg:border-text">
        <span className={label}>Localização</span>
        <Select
          bare
          value={draft.city}
          onChange={(city) => setDraft((d) => ({ ...d, city }))}
          className="w-full justify-between text-[15px]"
          options={[{ value: '', label: 'Todas as cidades' }, ...CITIES.map((c) => ({ value: c, label: c }))]}
        />
      </label>

      <div className="relative hidden lg:block lg:border-r lg:border-text">
        <Popover
          align="left"
          className="h-full"
          panelClassName="w-72"
          renderTrigger={(props) => (
            <button
              type="button"
              {...props}
              className="block h-full w-full px-4 py-2.5 text-left hover:bg-text/4"
            >
              <span className={label}>Data</span>
              <span className="flex items-center justify-between text-[15px] font-semibold">
                {dateLabel || <span className="font-normal text-neutral-600">Qualquer data</span>}
                <CalendarDays size={15} aria-hidden />
              </span>
            </button>
          )}
        >
          {(close) => (
            <div className="flex flex-col gap-3">
              <label className="text-muted text-xs">
                De
                <input
                  type="date"
                  value={draft.from}
                  max={draft.to || undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                  className="mt-1 block w-full border border-divider bg-surface px-2.5 py-1.5 text-sm text-text"
                />
              </label>
              <label className="text-muted text-xs">
                Até
                <input
                  type="date"
                  value={draft.to}
                  min={draft.from || undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                  className="mt-1 block w-full border border-divider bg-surface px-2.5 py-1.5 text-sm text-text"
                />
              </label>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setDraft((d) => ({ ...d, from: '', to: '' }))}>
                  Limpar
                </Button>
                <Button size="md" onClick={close}>
                  Aplicar
                </Button>
              </div>
            </div>
          )}
        </Popover>
      </div>

      <Button type="submit" size="lg" className="hidden px-7 text-[15px] lg:inline-flex">
        Buscar
      </Button>
    </form>
  )
}
