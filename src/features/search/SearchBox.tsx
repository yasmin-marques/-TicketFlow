import { Search } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useEventSuggestions } from '@/features/events/hooks'

/**
 * Busca global do header: combobox com sugestões de eventos (título, artista,
 * local). Enter busca em /eventos; "/" foca o campo de qualquer lugar.
 */
export function SearchBox({ className }: { className?: string }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const urlQuery = pathname.startsWith('/eventos') ? (params.get('q') ?? '') : ''

  const [value, setValue] = useState(urlQuery)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    setValue(urlQuery)
  }, [urlQuery])

  const debounced = useDebouncedValue(value.trim(), 200)
  const { data: suggestions = [] } = useEventSuggestions(debounced)
  const showList = open && debounced.length >= 2 && suggestions.length > 0

  // Atalho "/" para focar a busca.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing = el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Fecha ao clicar fora.
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [])

  const submit = () => {
    setOpen(false)
    const q = value.trim()
    navigate(q ? `/eventos?q=${encodeURIComponent(q)}` : '/eventos')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && showList) {
      e.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp' && showList) {
      e.preventDefault()
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Escape') {
      if (open) setOpen(false)
      else inputRef.current?.blur()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const chosen = showList ? suggestions[active] : undefined
      if (chosen) {
        setOpen(false)
        navigate(`/eventos/${chosen.slug}`)
      } else submit()
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="flex items-center gap-2 border border-divider px-3 py-2 text-sm focus-within:border-accent"
      >
        <Search size={16} aria-hidden className="shrink-0 text-neutral-700" />
        <input
          ref={inputRef}
          type="search"
          value={value}
          placeholder="Buscar eventos, artistas, locais"
          aria-label="Buscar eventos, artistas, locais"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          onChange={(e) => {
            setValue(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-neutral-700 [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd
          aria-hidden
          className="border border-neutral-400 px-1.5 py-px font-mono text-[11px] font-semibold text-neutral-700"
        >
          /
        </kbd>
      </form>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-40 mt-1 border-2 border-text bg-bg shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.slug}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false)
                navigate(`/eventos/${s.slug}`)
              }}
              className={cn(
                'cursor-pointer border-b border-neutral-300 px-3 py-2 last:border-b-0',
                i === active && 'bg-text/7',
              )}
            >
              <div className="text-sm font-extrabold">{s.title}</div>
              <div className="text-muted text-xs">
                {s.category} · {s.venue}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
