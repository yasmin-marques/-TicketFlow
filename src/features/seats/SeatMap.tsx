import { Accessibility, Check, Minus, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import { seatId as makeSeatId, sectorOfRow } from '@/lib/purchase'
import type { SeatMapLayout, SeatState } from '@/types/purchase'

const SEAT = 26
const GAP = 6
const AISLE = 18
const LABEL = 28
const TOP_PAD = 40 // espaço do tooltip acima da primeira fila

interface SeatMapProps {
  layout: SeatMapLayout
  /** Assentos vendidos/reservados por outras pessoas. */
  taken: Readonly<Record<string, SeatState>>
  selected: ReadonlySet<string>
  /** Assentos com requisição em andamento. */
  pending: ReadonlySet<string>
  /** Setores com ingressos no carrinho — os demais ficam desabilitados. */
  enabledSectorIds: ReadonlySet<string>
  /** Setor em destaque (chip ativo); os outros ficam levemente esmaecidos. */
  emphasisSectorId: string | null
  showAccessible: boolean
  onToggle: (seatId: string) => void
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * Mapa de assentos interativo: quatro estados visuais (disponível, selecionado,
 * vendido, reservado por outra pessoa), zoom (botões e Ctrl+scroll), arrastar
 * para mover e navegação por setas (tabindex móvel).
 */
export function SeatMap({ layout, taken, selected, pending, enabledSectorIds, emphasisSectorId, showAccessible, onToggle }: SeatMapProps) {
  const { rows, seatsPerRow, aisleAfter } = layout
  const contentWidth = LABEL + seatsPerRow * SEAT + (seatsPerRow - 1) * GAP + AISLE

  const scrollRef = useRef<HTMLDivElement>(null)
  const seatRefs = useRef(new Map<string, HTMLButtonElement>())
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [userZoomed, setUserZoomed] = useState(false)
  const [fit, setFit] = useState(1)
  const [hovered, setHovered] = useState<string | null>(null)
  const [focusId, setFocusId] = useState(makeSeatId(rows[0] ?? 'A', 1))
  const accessible = useMemo(() => new Set(layout.accessibleSeatIds), [layout.accessibleSeatIds])

  // Zoom que cabe na largura disponível (máx. 1,3× como no protótipo).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => {
      const next = clamp((el.clientWidth - 16) / contentWidth, 0.5, 1.3)
      setFit(next)
      if (!userZoomed) setZoom(next)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [contentWidth, userZoomed])

  // Ctrl + scroll para zoom (precisa de listener não passivo para impedir o zoom da página).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setUserZoomed(true)
      setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.4, 2))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const changeZoom = (factor: number) => {
    setUserZoomed(true)
    setZoom((z) => clamp(z * factor, 0.4, 2))
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    const el = scrollRef.current
    if (!el) return
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
    el.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = scrollRef.current
    if (!d || !el) return
    el.scrollLeft = d.left - (e.clientX - d.x)
    el.scrollTop = d.top - (e.clientY - d.y)
  }
  const endDrag = () => {
    drag.current = null
  }

  const move = (id: string, e: KeyboardEvent) => {
    const row = rows.indexOf(id.charAt(0))
    const col = Number(id.slice(1))
    let r = row
    let c = col
    if (e.key === 'ArrowRight') c += 1
    else if (e.key === 'ArrowLeft') c -= 1
    else if (e.key === 'ArrowDown') r += 1
    else if (e.key === 'ArrowUp') r -= 1
    else if (e.key === 'Home') c = 1
    else if (e.key === 'End') c = seatsPerRow
    else return
    e.preventDefault()
    const nextRow = rows[clamp(r, 0, rows.length - 1)]
    if (!nextRow) return
    const next = makeSeatId(nextRow, clamp(c, 1, seatsPerRow))
    setFocusId(next)
    seatRefs.current.get(next)?.focus()
  }

  const hoveredInfo = (() => {
    if (!hovered) return null
    const row = hovered.charAt(0)
    const n = Number(hovered.slice(1))
    const sector = sectorOfRow(layout, row)
    const state = taken[hovered]
    const label = state === 'sold' ? 'Vendido' : state === 'reserved' ? 'Reservado por outra pessoa' : sector ? formatPrice(sector.price) : ''
    const center = LABEL + (n - 1) * (SEAT + GAP) + (n > aisleAfter ? AISLE : 0) + SEAT / 2
    // Nas pontas, ancora o tooltip no assento (esquerda/direita) para não ser cortado pelo contêiner.
    const align: 'start' | 'center' | 'end' = n <= 4 ? 'start' : n > seatsPerRow - 4 ? 'end' : 'center'
    return {
      text: `${sector?.name ?? ''} · Fila ${row} · Assento ${String(n).padStart(2, '0')} · `,
      label,
      left: align === 'start' ? center - SEAT / 2 : align === 'end' ? center + SEAT / 2 : center,
      align,
      top: TOP_PAD + rows.indexOf(row) * (SEAT + GAP) - 34,
    }
  })()

  const btn = 'grid size-9 place-items-center transition-colors hover:bg-text/7 active:bg-text/14'

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span id="seat-map-hint" className="text-muted hidden text-xs sm:inline">
          Arraste para mover · Ctrl + scroll para zoom · setas para navegar
        </span>
        <div className="ml-auto flex border-2 border-text" role="group" aria-label="Zoom do mapa">
          <button type="button" className={btn} aria-label="Aumentar zoom" onClick={() => changeZoom(1.15)}>
            <Plus size={16} strokeWidth={3} aria-hidden />
          </button>
          <button type="button" className={cn(btn, 'border-l-2 border-text')} aria-label="Diminuir zoom" onClick={() => changeZoom(1 / 1.15)}>
            <Minus size={16} strokeWidth={3} aria-hidden />
          </button>
          <button
            type="button"
            className={cn(btn, 'w-auto border-l-2 border-text px-3 text-[13px] font-semibold')}
            onClick={() => {
              setUserZoomed(false)
              setZoom(fit)
            }}
          >
            Ajustar
          </button>
        </div>
      </div>

      <div className="mx-auto mb-1 flex h-11 w-[min(620px,100%)] items-center justify-center bg-text text-[13px] font-extrabold tracking-[0.4em] text-bg">
        PALCO
      </div>

      <div
        ref={scrollRef}
        role="group"
        aria-label="Mapa de assentos"
        aria-describedby="seat-map-hint"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="max-h-[62vh] cursor-grab touch-pan-x touch-pan-y overflow-auto active:cursor-grabbing"
      >
        <div className="relative mx-auto w-fit pb-4" style={{ zoom, paddingTop: TOP_PAD }}>
          {hoveredInfo && (
            <div
              role="tooltip"
              className={cn(
                'pointer-events-none absolute z-10 bg-text px-[11px] py-[7px] text-[11px] whitespace-nowrap text-bg shadow-md',
                hoveredInfo.align === 'center' && '-translate-x-1/2',
                hoveredInfo.align === 'end' && '-translate-x-full',
              )}
              style={{ left: hoveredInfo.left, top: hoveredInfo.top }}
            >
              {hoveredInfo.text}
              <b>{hoveredInfo.label}</b>
            </div>
          )}

          {rows.map((row) => {
            const sector = sectorOfRow(layout, row)
            const sectorEnabled = !!sector && enabledSectorIds.has(sector.id)
            const dimmed = !sectorEnabled
            const muted = sectorEnabled && emphasisSectorId !== null && sector?.id !== emphasisSectorId
            return (
              <div key={row} role="presentation" className="mb-1.5 flex items-center" style={{ gap: GAP }}>
                <span aria-hidden className="text-muted mr-1.5 w-[22px] text-center font-mono text-[11px] font-semibold">
                  {row}
                </span>
                {Array.from({ length: seatsPerRow }, (_, i) => {
                  const n = i + 1
                  const id = makeSeatId(row, n)
                  const isSelected = selected.has(id)
                  const state = taken[id]
                  const isTaken = !isSelected && state !== undefined
                  const blocked = isTaken || (dimmed && !isSelected)
                  const isAccessible = accessible.has(id)
                  const stateText = isSelected
                    ? 'selecionado'
                    : state === 'sold'
                      ? 'vendido'
                      : state === 'reserved'
                        ? 'reservado por outra pessoa'
                        : dimmed
                          ? 'fora da sua seleção de ingressos'
                          : 'disponível'
                  return (
                    <button
                      key={id}
                      ref={(el) => {
                        if (el) seatRefs.current.set(id, el)
                        else seatRefs.current.delete(id)
                      }}
                      type="button"
                      tabIndex={focusId === id ? 0 : -1}
                      aria-pressed={isSelected}
                      aria-disabled={blocked || undefined}
                      aria-label={`Assento ${id}, ${sector?.name ?? ''}, ${sector ? formatPrice(sector.price) : ''}${isAccessible ? ', acessível' : ''}, ${stateText}`}
                      onClick={() => !blocked && onToggle(id)}
                      onKeyDown={(e) => move(id, e)}
                      onFocus={() => {
                        setFocusId(id)
                        setHovered(id)
                      }}
                      onBlur={() => setHovered((h) => (h === id ? null : h))}
                      onMouseEnter={() => setHovered(id)}
                      onMouseLeave={() => setHovered((h) => (h === id ? null : h))}
                      style={{ marginLeft: n === aisleAfter + 1 ? AISLE : 0, width: SEAT, height: SEAT }}
                      className={cn(
                        'relative grid shrink-0 place-items-center border-2 duration-[120ms] transition-colors',
                        isSelected && 'border-accent bg-accent text-white',
                        !isSelected && state === 'sold' && 'cursor-not-allowed border-neutral-400 bg-neutral-400',
                        !isSelected && state === 'reserved' && 'bg-reserved cursor-not-allowed border-warning',
                        !isSelected && !state && 'border-text bg-bg',
                        !isSelected && !state && !blocked && 'hover:bg-text/10',
                        !isSelected && !state && blocked && 'cursor-not-allowed opacity-35',
                        muted && !isSelected && 'opacity-60',
                        pending.has(id) && 'animate-pulse',
                        showAccessible && isAccessible && 'outline-2 outline-offset-1 outline-text',
                      )}
                    >
                      {isSelected && <Check size={14} strokeWidth={4} aria-hidden />}
                      {showAccessible && isAccessible && !isSelected && !isTaken && <Accessibility size={13} aria-hidden />}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Legenda: disponível · vendido · selecionado · reservado por outra pessoa. */
export function SeatLegend({ className }: { className?: string }) {
  const item = 'flex items-center gap-1.5'
  return (
    <ul aria-label="Legenda do mapa" className={cn('m-0 flex list-none flex-wrap gap-x-5 gap-y-2 border-t-2 border-text p-0 pt-2.5 text-xs', className)}>
      <li className={item}>
        <i className="size-3.5 border-2 border-text" /> Disponível
      </li>
      <li className={item}>
        <i className="size-3.5 bg-neutral-400" /> Vendido
      </li>
      <li className={item}>
        <i className="size-3.5 bg-accent" /> Selecionado
      </li>
      <li className={item}>
        <i className="bg-reserved size-3.5 border-2 border-warning" /> Reservado por outra pessoa
      </li>
    </ul>
  )
}
