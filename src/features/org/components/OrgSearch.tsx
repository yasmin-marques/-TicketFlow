import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { cn } from '@/lib/cn'
import { orgService } from '@/services/api/org.service'
import { orgKeys } from '../hooks'

/** Busca global do painel (⌘K / Ctrl+K): eventos e pedidos. */
export function OrgSearch({ className }: { className?: string }) {
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const q = useDebouncedValue(value.trim(), 200)
  const { data } = useQuery({
    queryKey: orgKeys.search(q),
    queryFn: ({ signal }) => orgService.search(q, signal),
    enabled: q.length >= 2,
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [])

  const hasResults = !!data && (data.events.length > 0 || data.orders.length > 0)
  const close = () => {
    setOpen(false)
    setValue('')
  }

  return (
    <div ref={rootRef} className={cn('relative w-full max-w-[280px]', className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) navigate(`/org/pedidos?q=${encodeURIComponent(value.trim())}`)
          close()
        }}
        className="transition-control flex items-center gap-2 rounded-full border border-divider bg-card px-3.5 py-[7px] text-sm shadow-xs hover:border-text/40 focus-within:border-accent focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-accent)_14%,transparent)]"
      >
        <Search size={15} aria-hidden className="flex-none text-neutral-700" />
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && close()}
          placeholder="Buscar pedido, evento…"
          aria-label="Buscar pedido ou evento"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-neutral-700 [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd aria-hidden className="hidden flex-none rounded-xs border border-neutral-300 bg-neutral-100 px-1.5 py-px font-mono text-[11px] font-semibold text-neutral-700 lg:block">
          ⌘K
        </kbd>
      </form>
      {open && q.length >= 2 && (
        <div className="animate-pop-in absolute inset-x-0 top-full z-40 mt-2 min-w-[300px] overflow-hidden rounded-card border border-line bg-card shadow-lg sm:right-0 sm:left-auto sm:w-[360px]">
          {!data ? (
            <p className="text-muted p-3 text-sm">Buscando…</p>
          ) : !hasResults ? (
            <p className="text-muted p-3 text-sm">Nada encontrado para “{q}”.</p>
          ) : (
            <>
              {data.events.length > 0 && (
                <section aria-label="Eventos">
                  <h3 className="m-0 px-3 pt-2 text-[11px] tracking-[0.08em] uppercase">Eventos</h3>
                  <ul className="m-0 list-none p-0">
                    {data.events.map((e) => (
                      <li key={e.id}>
                        <Link to={`/org/eventos/${e.id}`} onClick={close} className="rounded-sm block px-3 py-2 text-sm font-semibold text-text no-underline hover:bg-text/7">
                          {e.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {data.orders.length > 0 && (
                <section aria-label="Pedidos" className="border-t border-line">
                  <h3 className="m-0 px-3 pt-2 text-[11px] tracking-[0.08em] uppercase">Pedidos</h3>
                  <ul className="m-0 list-none p-0">
                    {data.orders.map((o) => (
                      <li key={o.id}>
                        <Link to={`/org/pedidos?q=${encodeURIComponent(o.code)}`} onClick={close} className="rounded-sm block px-3 py-2 text-sm text-text no-underline hover:bg-text/7">
                          <b>#{o.code}</b> · {o.buyerName}
                          <span className="text-muted block text-xs">{o.eventTitle}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
