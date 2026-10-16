import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { reservationMatchesCart, sectorOfSeat } from '@/lib/purchase'
import { ApiError, newIdempotencyKey } from '@/services/api/http'
import { reservationsService } from '@/services/api/purchase.service'
import type { EventSales, Reservation, SeatAvailability, TicketType } from '@/types/purchase'
import { applySeatUpdate, purchaseKeys } from '../purchase/hooks'
import { getActiveReservationId } from '../reservation/activeReservation'
import { useReservation } from '../reservation/ReservationProvider'

type IntentKind = 'add' | 'remove' | 'swap'

interface Intent {
  id: number
  typeId: string
  kind: IntentKind
  seatId: string
}

export interface ConflictState {
  typeId: string
  seatIds: string[]
  suggestions: string[]
  message: string
}

function applyIntent(seats: string[], intent: Pick<Intent, 'kind' | 'seatId'>): string[] {
  if (intent.kind === 'remove') return seats.filter((s) => s !== intent.seatId)
  if (intent.kind === 'swap') return [intent.seatId]
  return seats.includes(intent.seatId) ? seats : [...seats, intent.seatId]
}

/**
 * Seleção de assentos sobre a reserva do servidor.
 *
 * - A tela mostra "estado do servidor + intenções pendentes" (otimista).
 * - As requisições são serializadas: cada intenção é reaplicada sobre o
 *   estado mais recente da reserva, então uma falha não contamina as seguintes.
 * - A primeira escolha cria a reserva (começa o prazo de 10 min); as demais
 *   substituem o conjunto de assentos do tipo (`PUT .../seats`, idempotente).
 * - `409 Conflict` reverte a escolha, marca o assento como reservado no mapa
 *   e devolve vizinhos livres como sugestão.
 */
export function useSeatSelection(sales: EventSales | undefined, cart: Record<string, number>) {
  const queryClient = useQueryClient()
  const reservationCtx = useReservation()
  const toast = useToast()

  const [intents, setIntents] = useState<Intent[]>([])
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const seq = useRef(0)
  const cartRef = useRef(cart)
  cartRef.current = cart
  const salesRef = useRef(sales)
  salesRef.current = sales
  const ctxRef = useRef(reservationCtx)
  ctxRef.current = reservationCtx

  const seatedTypes = useMemo<TicketType[]>(
    () => sales?.ticketTypes.filter((t) => t.kind === 'seated' && (cart[t.id] ?? 0) > 0) ?? [],
    [sales, cart],
  )

  const reservation = reservationCtx.reservation
  const reservationUsable =
    !!sales && !!reservation && reservation.status === 'active' && reservation.eventId === sales.eventId && reservationMatchesCart(reservation, cart)

  const displayed = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const t of seatedTypes) {
      const server = reservationUsable ? (reservation!.items.find((i) => i.ticketTypeId === t.id)?.seatIds ?? []) : []
      out[t.id] = intents.filter((i) => i.typeId === t.id).reduce(applyIntent, server)
    }
    return out
  }, [seatedTypes, reservation, reservationUsable, intents])

  const selected = useMemo(() => new Set(Object.values(displayed).flat()), [displayed])
  const pending = useMemo(() => new Set(intents.map((i) => i.seatId)), [intents])
  const required = seatedTypes.reduce((s, t) => s + (cart[t.id] ?? 0), 0)
  const missing = required - selected.size
  const complete = required > 0 && missing === 0 && intents.length === 0

  const handleError = useCallback(
    (err: unknown, typeId: string) => {
      const sales = salesRef.current
      if (err instanceof ApiError) {
        if (err.status === 409 && err.code === 'SEAT_UNAVAILABLE') {
          const seatIds = (err.details.seatIds as string[] | undefined) ?? []
          if (sales) {
            queryClient.setQueryData<SeatAvailability>(purchaseKeys.seats(sales.eventId), (old) =>
              old ? seatIds.reduce((acc, id) => applySeatUpdate(acc, { seatId: id, status: 'reserved' }), old) : old,
            )
          }
          setConflict({ typeId, seatIds, suggestions: (err.details.suggestions as string[] | undefined) ?? [], message: err.message })
          return
        }
        if (err.status === 410 || err.code === 'RESERVATION_EXPIRED') {
          ctxRef.current.markExpired()
          return
        }
        if (err.status === 404) {
          ctxRef.current.forget()
          toast.show({ message: 'Sua reserva não foi encontrada. Escolha os assentos novamente.' })
          return
        }
        if (err.status === 409 || err.status === 422) {
          toast.show({ message: err.message })
          return
        }
      }
      toast.show({ message: 'Não foi possível reservar o assento. Tente novamente.' })
    },
    [queryClient, toast],
  )

  const process = useCallback(
    async (intent: Intent) => {
      const sales = salesRef.current
      if (!sales) return
      try {
        const activeId = getActiveReservationId()
        const latest = activeId ? queryClient.getQueryData<Reservation>(purchaseKeys.reservation(activeId)) : undefined
        const usable =
          !!latest && latest.status === 'active' && latest.eventId === sales.eventId && reservationMatchesCart(latest, cartRef.current)
        const base = usable ? (latest.items.find((i) => i.ticketTypeId === intent.typeId)?.seatIds ?? []) : []
        const next = applyIntent(base, intent)

        const result = usable
          ? await reservationsService.setSeats(latest.id, intent.typeId, next, newIdempotencyKey())
          : await reservationsService.create(
              {
                eventId: sales.eventId,
                items: Object.entries(cartRef.current)
                  .filter(([, q]) => q > 0)
                  .map(([ticketTypeId, quantity]) => ({
                    ticketTypeId,
                    quantity,
                    ...(ticketTypeId === intent.typeId ? { seatIds: next } : {}),
                  })),
              },
              newIdempotencyKey(),
            )
        ctxRef.current.setReservation(result)
      } catch (err) {
        handleError(err, intent.typeId)
      } finally {
        setIntents((cur) => cur.filter((i) => i.id !== intent.id))
      }
    },
    [queryClient, handleError],
  )

  const enqueue = useCallback(
    (typeId: string, kind: IntentKind, seatId: string) => {
      const intent: Intent = { id: ++seq.current, typeId, kind, seatId }
      setIntents((cur) => [...cur, intent])
      chain.current = chain.current.then(() => process(intent))
    },
    [process],
  )

  const toggle = useCallback(
    (seatId: string) => {
      if (!sales?.seatMap) return
      const sector = sectorOfSeat(sales.seatMap, seatId)
      const type = seatedTypes.find((t) => t.sectorId === sector?.id)
      if (!type) return
      const qty = cart[type.id] ?? 0
      const current = displayed[type.id] ?? []
      setConflict(null)

      if (current.includes(seatId)) return enqueue(type.id, 'remove', seatId)
      if (current.length < qty) return enqueue(type.id, 'add', seatId)
      if (qty === 1) return enqueue(type.id, 'swap', seatId)
      toast.show({ message: `Você já escolheu ${qty} assentos ${type.name}. Remova um para trocar.` })
    },
    [sales, seatedTypes, cart, displayed, enqueue, toast],
  )

  return {
    seatedTypes,
    displayed,
    selected,
    pending,
    required,
    missing,
    complete,
    reservation: reservationUsable ? reservation : null,
    conflict,
    dismissConflict: () => setConflict(null),
    toggle,
    busy: intents.length > 0,
  }
}
