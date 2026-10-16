import { useQueryClient } from '@tanstack/react-query'
import { Ban, Check, Hash, MousePointer2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import { ApiError } from '@/services/api/http'
import { orgService } from '@/services/api/org.service'
import type { OrgSeatCell, OrgSeatMap } from '@/types/organizer'
import { orgKeys } from './hooks'

const SEATS_PER_ROW = 16
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Planta inicial: 8 fileiras × 16, metade Premium e metade Standard. */
export function defaultSeatMap(): OrgSeatMap {
  return {
    sectors: [
      { id: 'premium', name: 'Premium', price: 120 },
      { id: 'standard', name: 'Standard', price: 80 },
    ],
    rows: LETTERS.slice(0, 8)
      .split('')
      .map((letter, ri) => ({
        letter,
        cells: Array.from({ length: SEATS_PER_ROW }, (_, i) => ({ label: `${letter}${String(i + 1).padStart(2, '0')}`, sectorId: ri < 4 ? 'premium' : 'standard', blocked: false })),
      })),
    generalCapacity: 0,
  }
}

export function seatMapCapacity(m: OrgSeatMap | null): { seats: number; general: number; total: number } {
  if (!m) return { seats: 0, general: 0, total: 0 }
  const seats = m.rows.reduce((n, r) => n + r.cells.filter((c) => c && !c.blocked).length, 0)
  return { seats, general: m.generalCapacity, total: seats + m.generalCapacity }
}

const key = (row: number, col: number) => `${row}:${col}`

interface SeatMapEditorProps {
  eventId: string
  initial: OrgSeatMap | null
  readOnly?: boolean
  onSaved?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * Editor de mapa de assentos: setores, fileiras, bloqueio e numeração.
 * Nesta etapa o mapa é salvo como um todo (`PUT /org/events/:id/seat-map`).
 */
export function SeatMapEditor({ eventId, initial, readOnly, onSaved, onDirtyChange }: SeatMapEditorProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [map, setMap] = useState<OrgSeatMap | null>(initial)
  const [saved, setSaved] = useState<string>(JSON.stringify(initial))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newSector, setNewSector] = useState({ name: '', price: '' })

  const dirty = JSON.stringify(map) !== saved
  const cap = seatMapCapacity(map)
  useEffect(() => {
    onDirtyChange?.(dirty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty])

  const sectorIndex = useMemo(() => new Map(map?.sectors.map((s, i) => [s.id, i]) ?? []), [map])
  const selectedCells = useMemo(() => {
    if (!map) return [] as OrgSeatCell[]
    return [...selected].flatMap((k) => {
      const [r, c] = k.split(':').map(Number) as [number, number]
      const cell = map.rows[r]?.cells[c]
      return cell ? [cell] : []
    })
  }, [map, selected])

  const mutate = (fn: (m: OrgSeatMap) => OrgSeatMap) => setMap((m) => (m ? fn(structuredClone(m)) : m))

  const toggle = (r: number, c: number, shift: boolean) => {
    const k = key(r, c)
    setSelected((cur) => {
      const next = new Set(cur)
      if (shift && anchor) {
        const [ar, ac] = anchor.split(':').map(Number) as [number, number]
        if (ar === r) for (let x = Math.min(ac, c); x <= Math.max(ac, c); x++) next.add(key(r, x))
        return next
      }
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
    setAnchor(k)
  }

  const selectRow = (r: number) =>
    setSelected((cur) => {
      const next = new Set(cur)
      const cells = map?.rows[r]?.cells ?? []
      const all = cells.every((c, i) => !c || next.has(key(r, i)))
      cells.forEach((c, i) => {
        if (!c) return
        if (all) next.delete(key(r, i))
        else next.add(key(r, i))
      })
      return next
    })

  const applyToSelection = (fn: (cell: OrgSeatCell) => OrgSeatCell | null) =>
    mutate((m) => {
      for (const k of selected) {
        const [r, c] = k.split(':').map(Number) as [number, number]
        const cell = m.rows[r]?.cells[c]
        if (cell) m.rows[r]!.cells[c] = fn(cell)
      }
      return m
    })

  const renumber = () =>
    mutate((m) => {
      for (const row of m.rows) {
        let n = 0
        row.cells = row.cells.map((c) => (c ? { ...c, label: `${row.letter}${String(++n).padStart(2, '0')}` } : c))
      }
      return m
    })

  const addRow = () =>
    mutate((m) => {
      const letter = LETTERS[m.rows.length]
      if (!letter) return m
      const sector = m.sectors[0]?.id ?? ''
      m.rows.push({ letter, cells: Array.from({ length: SEATS_PER_ROW }, (_, i) => ({ label: `${letter}${String(i + 1).padStart(2, '0')}`, sectorId: sector, blocked: false })) })
      return m
    })

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await orgService.saveSeatMap(eventId, map)
      await queryClient.invalidateQueries({ queryKey: orgKeys.all })
      setSaved(JSON.stringify(map))
      toast.show({ message: 'Mapa de assentos salvo' })
      onSaved?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar o mapa. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  if (!map) {
    return (
      <EmptyState
        title="Evento sem mapa de assentos"
        description="Sem mapa, o comprador escolhe apenas tipo e quantidade. Crie um mapa para vender lugares marcados."
        actions={
          !readOnly ? (
            <Button
              onClick={() => {
                setMap(defaultSeatMap())
                setSelected(new Set())
              }}
            >
              Criar mapa padrão
            </Button>
          ) : undefined
        }
      />
    )
  }

  const tool = 'inline-flex items-center gap-1.5 border border-divider px-3 py-1.5 text-[13px] font-semibold transition-colors hover:bg-text/7 disabled:cursor-not-allowed disabled:opacity-45'
  const selectedLabels = selectedCells.map((c) => c.label).sort()
  const allBlocked = selectedCells.length > 0 && selectedCells.every((c) => c.blocked)
  const commonSector = selectedCells.length && selectedCells.every((c) => c.sectorId === selectedCells[0]!.sectorId) ? selectedCells[0]!.sectorId : ''

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr_240px]">
      {/* Setores */}
      <section aria-label="Setores" className="order-1">
        <h3 className="mb-2 text-[13px] tracking-[0.08em] uppercase">Setores</h3>
        <ul className="m-0 list-none border-t-2 border-text p-0">
          {map.sectors.map((s, i) => {
            const seats = map.rows.reduce((n, r) => n + r.cells.filter((c) => c?.sectorId === s.id).length, 0)
            const rows = map.rows.filter((r) => r.cells.some((c) => c?.sectorId === s.id)).length
            return (
              <li key={s.id} className="border-b border-neutral-400 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <b>
                    <span aria-hidden className={cn('mr-1.5 inline-block size-3 border-2 border-text align-[-1px]', i === 0 ? 'bg-bg' : i === 1 ? 'bg-neutral-300' : 'bg-neutral-500')} />
                    {s.name}
                  </b>
                  {readOnly ? (
                    <span className="tabular">{formatPrice(s.price)}</span>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      aria-label={`Preço do setor ${s.name}`}
                      value={s.price}
                      onChange={(e) => mutate((m) => { m.sectors[i]!.price = Math.max(0, Number(e.target.value) || 0); return m })}
                      className="tabular w-20 border border-divider bg-surface px-1.5 py-0.5 text-right text-sm"
                    />
                  )}
                </div>
                <div className="text-muted text-xs">{rows} fileiras · {seats} lugares</div>
              </li>
            )
          })}
          <li className="border-b border-neutral-400 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <b>Pista</b>
            </div>
            <label className="text-muted flex items-center gap-1.5 text-xs">
              Sem assento ·
              <input
                type="number"
                min={0}
                disabled={readOnly}
                aria-label="Lugares da pista"
                value={map.generalCapacity}
                onChange={(e) => mutate((m) => { m.generalCapacity = Math.max(0, Math.floor(Number(e.target.value) || 0)); return m })}
                className="tabular w-20 border border-divider bg-surface px-1.5 py-0.5 text-right text-sm text-text"
              />
              lugares
            </label>
          </li>
        </ul>
        {!readOnly && (
          <form
            className="mt-3 grid gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const name = newSector.name.trim()
              if (!name) return
              mutate((m) => {
                m.sectors.push({ id: `s${Date.now().toString(36)}`, name, price: Math.max(0, Number(newSector.price) || 0) })
                return m
              })
              setNewSector({ name: '', price: '' })
            }}
          >
            <TextField label="Novo setor" value={newSector.name} onChange={(e) => setNewSector((s) => ({ ...s, name: e.target.value }))} placeholder="Nome" />
            <TextField label="Preço (R$)" type="number" min={0} value={newSector.price} onChange={(e) => setNewSector((s) => ({ ...s, price: e.target.value }))} />
            <Button type="submit" variant="secondary" disabled={!newSector.name.trim()}>
              <Plus size={14} aria-hidden /> Novo setor
            </Button>
          </form>
        )}
      </section>

      {/* Planta */}
      <section aria-label="Planta do mapa" className="order-3 min-w-0 lg:order-2">
        {!readOnly && (
          <div role="toolbar" aria-label="Ferramentas do mapa" className="mb-3 flex flex-wrap gap-2">
            <span className={cn(tool, 'bg-text text-bg')} aria-hidden>
              <MousePointer2 size={14} /> Selecionar
            </span>
            <button type="button" className={tool} onClick={addRow} disabled={map.rows.length >= LETTERS.length}>
              <Plus size={14} aria-hidden /> Fileira
            </button>
            <button type="button" className={tool} disabled={selectedCells.length === 0} onClick={() => applyToSelection((c) => ({ ...c, blocked: !allBlocked }))}>
              <Ban size={14} aria-hidden /> {allBlocked ? 'Desbloquear' : 'Bloquear'}
            </button>
            <button type="button" className={tool} onClick={renumber}>
              <Hash size={14} aria-hidden /> Numerar
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <div className="mx-auto w-fit">
            <div className="mb-4 flex h-9 w-full items-center justify-center bg-text text-xs font-extrabold tracking-[0.4em] text-bg">PALCO</div>
            {map.rows.map((row, r) => (
              <div key={row.letter} className="mb-1.5 flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={`Selecionar fileira ${row.letter}`}
                  disabled={readOnly}
                  onClick={() => selectRow(r)}
                  className="text-muted mr-1.5 w-[22px] text-center font-mono text-[11px] font-semibold hover:text-text"
                >
                  {row.letter}
                </button>
                {row.cells.map((cell, c) => {
                  const isSel = selected.has(key(r, c))
                  return (
                    <span key={c} className={cn('flex', c === 8 && 'ml-[18px]')}>
                      {cell ? (
                        <button
                          type="button"
                          disabled={readOnly}
                          aria-label={`Assento ${cell.label}, ${map.sectors.find((s) => s.id === cell.sectorId)?.name ?? ''}${cell.blocked ? ', bloqueado' : ''}${isSel ? ', selecionado' : ''}`}
                          aria-pressed={isSel}
                          onClick={(e) => toggle(r, c, e.shiftKey)}
                          className={cn(
                            'grid size-[26px] place-items-center border-2 text-[9px] font-extrabold',
                            isSel
                              ? 'border-accent bg-accent text-white'
                              : cell.blocked
                                ? 'border-neutral-400 bg-neutral-400 text-neutral-700'
                                : cn('border-text', (sectorIndex.get(cell.sectorId) ?? 0) === 0 ? 'bg-bg' : (sectorIndex.get(cell.sectorId) ?? 0) === 1 ? 'bg-neutral-300' : 'bg-neutral-500'),
                          )}
                        >
                          {cell.blocked && !isSel ? '×' : isSel ? <Check size={12} strokeWidth={4} aria-hidden /> : ''}
                        </button>
                      ) : (
                        <span aria-hidden className="size-[26px] border border-dashed border-neutral-400" />
                      )}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="text-muted mt-3 text-xs">
          Cinza escuro = bloqueado pelo organizador · vermelho = seleção atual · tracejado = sem assento. Shift + clique seleciona um intervalo na fileira.
        </p>
      </section>

      {/* Seleção */}
      <section aria-label="Seleção" className="order-2 lg:order-3">
        <h3 className="mb-2 text-[13px] tracking-[0.08em] uppercase">
          Seleção{selectedLabels.length ? ` · ${selectedLabels.length > 2 ? `${selectedLabels[0]}–${selectedLabels[selectedLabels.length - 1]}` : selectedLabels.join(', ')}` : ''}
        </h3>
        <div className="border-2 border-text p-4">
          {selectedCells.length === 0 ? (
            <p className="text-muted m-0 text-sm">Clique nos assentos para selecioná-los e editar setor ou bloqueio.</p>
          ) : (
            <>
              <div className="text-muted mb-1 text-xs">{selectedCells.length} assentos</div>
              <label className="text-muted block text-xs">
                Setor
                <Select
                  value={commonSector}
                  disabled={readOnly}
                  aria-label="Setor da seleção"
                  onChange={(id) => applyToSelection((c) => ({ ...c, sectorId: id }))}
                  options={[...(commonSector ? [] : [{ value: '', label: 'Vários setores' }]), ...map.sectors.map((s) => ({ value: s.id, label: s.name }))]}
                  className="mt-1 w-full justify-between"
                />
              </label>
              <div className="mt-3 flex items-baseline justify-between text-sm">
                <span className="text-muted">Preço base</span>
                <b className="tabular">{commonSector ? formatPrice(map.sectors.find((s) => s.id === commonSector)?.price ?? 0) : '—'}</b>
              </div>
              {!readOnly && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => applyToSelection((c) => ({ ...c, blocked: !allBlocked }))}>
                    {allBlocked ? 'Desbloquear' : 'Bloquear'}
                  </Button>
                  <Button
                    variant="secondary"
                    className="text-accent-700"
                    onClick={() => {
                      applyToSelection(() => null)
                      setSelected(new Set())
                    }}
                  >
                    <Trash2 size={14} aria-hidden /> Remover
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        <div className="mt-4 border-t-2 border-text pt-3 text-sm">
          <div className="flex items-baseline justify-between">
            <span>Capacidade total:</span>
            <b className="tabular text-2xl">{cap.total.toLocaleString('pt-BR')}</b>
          </div>
          <div className="text-muted text-xs">Assentos {cap.seats} + Pista {cap.general}</div>
        </div>
        {!readOnly && (
          <div className="mt-4 flex flex-col gap-2">
            {error && <Alert title={error} />}
            <Button disabled={!dirty || saving} onClick={save}>
              {saving ? 'Salvando…' : dirty ? 'Salvar mapa' : 'Mapa salvo'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setMap(null)
                setSelected(new Set())
              }}
            >
              Remover mapa de assentos
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
