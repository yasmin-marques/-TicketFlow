import { Accessibility, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { LoadError } from '@/components/domain/LoadError'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCart, useSales, useSeatAvailability } from '@/features/purchase/hooks'
import { Countdown, CountdownBar } from '@/features/reservation/Countdown'
import { SeatLegend, SeatMap } from '@/features/seats/SeatMap'
import { useSeatSelection } from '@/features/seats/useSeatSelection'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDateWithTime, formatPrice } from '@/lib/format'
import { computeTotals, seatLabel, sectorOfSeat, unitFee } from '@/lib/purchase'
import { ApiError } from '@/services/api/http'
import { NotFoundPage } from '../NotFoundPage'

/** Etapa 1 (continuação) — escolha dos assentos no mapa (/eventos/:slug/assentos). */
export function SeatSelectionPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { data: sales, isPending, error, refetch } = useSales(slug)
  const { cart } = useCart(slug)
  const availability = useSeatAvailability(sales?.eventId)
  const selection = useSeatSelection(sales, cart)
  const [emphasis, setEmphasis] = useState<string | null>(null)
  const [showAccessible, setShowAccessible] = useState(false)

  useDocumentTitle(sales ? `Assentos · ${sales.title}` : 'Assentos')

  // Setor em destaque padrão: o primeiro tipo com assento do carrinho.
  useEffect(() => {
    if (!emphasis && selection.seatedTypes[0]?.sectorId) setEmphasis(selection.seatedTypes[0].sectorId)
  }, [emphasis, selection.seatedTypes])

  const layout = sales?.seatMap ?? null
  const enabledSectors = useMemo(
    () => new Set(selection.seatedTypes.flatMap((t) => (t.sectorId ? [t.sectorId] : []))),
    [selection.seatedTypes],
  )

  if (error instanceof ApiError && error.isNotFound) return <NotFoundPage />
  // Sem assento marcado no carrinho: volta para a escolha de ingressos.
  if (sales && (!layout || selection.required === 0)) return <Navigate to={`/eventos/${slug}/ingressos`} replace />

  const lines = (sales?.ticketTypes ?? [])
    .filter((t) => (cart[t.id] ?? 0) > 0)
    .map((t) => ({ type: t, qty: cart[t.id]! }))
  const totals = computeTotals(
    lines.map((l) => ({ quantity: l.qty, unitPrice: l.type.price, unitFee: unitFee(l.type.price, sales?.serviceFeePct ?? 0) })),
  )

  const selectedList = [...selection.selected].sort()
  const subtitle = selection.seatedTypes
    .map((t) => `${cart[t.id]} ${t.name}`)
    .join(' + ')
  const reservation = selection.reservation
  const conflict = selection.conflict
  const takenSeats = availability.data?.seats ?? {}

  const goCheckout = () => {
    if (reservation && selection.complete) navigate(`/checkout/${reservation.id}`)
  }

  const continueLabel = selection.complete
    ? 'Continuar →'
    : selection.busy
      ? 'Reservando…'
      : `Escolha mais ${selection.missing} ${selection.missing === 1 ? 'assento' : 'assentos'}`

  const priceOf = (seat: string) => (layout ? (sectorOfSeat(layout, seat)?.price ?? 0) : 0)
  const sectorName = (seat: string) => (layout ? (sectorOfSeat(layout, seat)?.name ?? '') : '')

  return (
    <div className="grid lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 px-4 py-6 pb-28 lg:px-8 lg:py-6 lg:pb-6">
        {error ? (
          <LoadError title="Não foi possível carregar o mapa." error={error} onRetry={() => refetch()} />
        ) : isPending || !layout ? (
          <div aria-busy="true" aria-label="Carregando mapa de assentos">
            <Skeleton className="mb-3 h-12 w-2/3" />
            <Skeleton className="h-[420px]" />
          </div>
        ) : (
          <>
            <div className="mb-1">
              <div className="text-[22px] font-extrabold">{sales.title}</div>
              <div className="text-muted text-[13px]">
                Escolha {selection.required} {selection.required === 1 ? 'assento' : 'assentos'} · {subtitle}
              </div>
              <div className="text-muted mt-0.5 text-xs" aria-live="polite">
                {formatDateWithTime(sales.startsAt)} · {sales.venueName} ·{' '}
                {availability.stream === 'open' ? (
                  <span><span aria-hidden className="text-success">●</span> mapa atualizando ao vivo</span>
                ) : availability.stream === 'error' ? (
                  <span>atualização ao vivo indisponível — reconectando…</span>
                ) : (
                  <span>conectando…</span>
                )}
              </div>
            </div>

            <div className="my-4 flex flex-wrap gap-1.5">
              {selection.seatedTypes.map((t) => (
                <Chip
                  key={t.id}
                  size="md"
                  label={`${t.name} · ${formatPrice(t.price)}`}
                  selected={emphasis === t.sectorId}
                  onClick={() => setEmphasis(t.sectorId ?? null)}
                />
              ))}
              <Chip
                size="md"
                icon={<Accessibility size={14} aria-hidden />}
                label="Acessível"
                selected={showAccessible}
                onClick={() => setShowAccessible((v) => !v)}
              />
            </div>

            {availability.error && !availability.data ? (
              <LoadError title="Não foi possível carregar a disponibilidade." error={availability.error} onRetry={() => availability.refetch()} />
            ) : !availability.data ? (
              <Skeleton className="h-[420px]" />
            ) : (
              <SeatMap
                layout={layout}
                taken={takenSeats}
                selected={selection.selected}
                pending={selection.pending}
                enabledSectorIds={enabledSectors}
                emphasisSectorId={emphasis}
                showAccessible={showAccessible}
                onToggle={selection.toggle}
              />
            )}
            <SeatLegend className="mt-4" />

            {conflict && (
              <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 bg-text px-4 py-3 text-[13px] text-bg lg:fixed lg:inset-x-0 lg:bottom-0 lg:z-30 lg:mt-0 lg:px-8">
                <b className="text-accent-400">409 · Conflito</b>
                <span>
                  {conflict.message} O mapa já foi atualizado
                  {conflict.suggestions[0] ? ` — que tal ${conflict.suggestions[0]}${conflict.suggestions[1] ? ` ou ${conflict.suggestions[1]}` : ''}?` : '.'}
                </span>
                <span className="ml-auto flex gap-4">
                  {conflict.suggestions.slice(0, 1).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="font-extrabold text-accent-400 hover:underline"
                      onClick={() => selection.toggle(s)}
                    >
                      Selecionar {s}
                    </button>
                  ))}
                  <button type="button" className="font-semibold text-bg/80 hover:underline" onClick={selection.dismissConflict}>
                    Fechar
                  </button>
                </span>
              </div>
            )}
          </>
        )}
        <p className="mt-4 text-sm">
          <Link to={`/eventos/${slug}/ingressos`}>← Alterar ingressos</Link>
        </p>
      </div>

      <aside aria-label="Seus assentos" className="border-divider px-4 pb-28 lg:flex lg:flex-col lg:border-l-2 lg:p-7 lg:pb-7">
        <h2 className="mb-2 text-[13px] tracking-[0.08em] uppercase">Seus assentos</h2>
        {selectedList.length === 0 ? (
          <div className="border-t-2 border-text py-4 text-sm">
            <span className="text-muted">Nenhum assento escolhido ainda.</span>
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {selectedList.map((seat, i) => (
              <li
                key={seat}
                className={`grid grid-cols-[52px_1fr_auto_auto] items-center gap-3 py-3 ${i === 0 ? 'border-t-2 border-text' : ''} ${i === selectedList.length - 1 ? 'border-b-2 border-divider' : 'border-b border-neutral-400'}`}
              >
                <b className="text-[22px]">{seat}</b>
                <span className="text-[13px]">
                  Setor {sectorName(seat)}
                  <br />
                  <span className="text-muted">{seatLabel(seat)}</span>
                </span>
                <b className="tabular">{formatPrice(priceOf(seat))}</b>
                <button
                  type="button"
                  aria-label={`Remover assento ${seat}`}
                  className="grid size-7 place-items-center hover:bg-text/7"
                  onClick={() => selection.toggle(seat)}
                >
                  <X size={16} strokeWidth={3} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 border-2 border-text p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px]">Tempo restante</span>
            {reservation ? (
              <Countdown expiresAt={reservation.expiresAt} className="text-[34px] tracking-[-0.02em]" />
            ) : (
              <b className="tabular text-[34px] text-neutral-500">10:00</b>
            )}
          </div>
          {reservation ? (
            <CountdownBar createdAt={reservation.createdAt} expiresAt={reservation.expiresAt} />
          ) : (
            <div aria-hidden className="my-2.5 h-1 bg-neutral-300" />
          )}
          <div className="text-muted text-xs">
            {reservation
              ? 'Seus assentos estão guardados para você. Se o tempo acabar, eles voltam para a venda — você pode escolher de novo.'
              : 'A reserva de 10 minutos começa quando você escolher o primeiro assento.'}
          </div>
        </div>

        <div className="mt-auto pt-6 max-lg:hidden">
          <div className="flex justify-between py-1.5">
            <span className="text-muted">Taxa</span>
            <span className="tabular">{formatPrice(totals.fee)}</span>
          </div>
          <div className="flex items-baseline justify-between border-t-2 border-text pt-3 pb-4">
            <b>Total</b>
            <b className="tabular text-[30px]">{formatPrice(totals.total)}</b>
          </div>
          <Button block size="xl" disabled={!selection.complete} onClick={goCheckout}>
            {continueLabel}
          </Button>
        </div>
      </aside>

      {/* Mobile: barra fixa com assentos, total e ação. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t-2 border-text bg-bg px-4 py-3 lg:hidden">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold">
            {selectedList.length ? selectedList.join(', ') : 'Nenhum assento'}
          </div>
          <div className="text-muted tabular text-xs">
            {reservation ? <Countdown expiresAt={reservation.expiresAt} icon /> : 'Sem reserva ainda'} · {formatPrice(totals.total)}
          </div>
        </div>
        <Button disabled={!selection.complete} onClick={goCheckout} size="lg">
          {selection.complete ? 'Continuar →' : `Faltam ${Math.max(0, selection.missing)}`}
        </Button>
      </div>
      <span className="sr-only" aria-live="polite">
        {selection.complete ? 'Todos os assentos escolhidos. Você já pode continuar.' : ''}
      </span>
    </div>
  )
}
