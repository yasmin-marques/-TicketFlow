import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { ordersService, salesService, ticketsService } from '@/services/api/purchase.service'
import { newIdempotencyKey } from '@/services/api/http'
import { openSeatStream, type StreamStatus } from '@/services/realtime/seatStream'
import type { SeatAvailability, SeatUpdate } from '@/types/purchase'

export const purchaseKeys = {
  sales: (slug: string) => ['sales', slug] as const,
  seats: (eventId: string) => ['seats', eventId] as const,
  reservation: (id: string) => ['reservation', id] as const,
  orders: () => ['orders'] as const,
  order: (id: string) => ['orders', id] as const,
  tickets: () => ['tickets'] as const,
  ticket: (id: string) => ['tickets', id] as const,
}

export function useSales(slug: string) {
  return useQuery({
    queryKey: purchaseKeys.sales(slug),
    queryFn: ({ signal }) => salesService.bySlug(slug, signal),
    staleTime: 10_000,
  })
}

/** Aplica uma atualização SSE ao cache de disponibilidade. */
export function applySeatUpdate(data: SeatAvailability, update: SeatUpdate): SeatAvailability {
  const seats = { ...data.seats }
  if (update.status === 'available') delete seats[update.seatId]
  else seats[update.seatId] = update.status
  return { ...data, seats, updatedAt: new Date().toISOString() }
}

/** Disponibilidade dos assentos + atualização em tempo real (SSE) no cache do TanStack Query. */
export function useSeatAvailability(eventId: string | undefined) {
  const queryClient = useQueryClient()
  const [stream, setStream] = useState<StreamStatus | 'connecting'>('connecting')

  const query = useQuery({
    queryKey: purchaseKeys.seats(eventId ?? ''),
    queryFn: ({ signal }) => salesService.seats(eventId!, signal),
    enabled: !!eventId,
    staleTime: 0,
  })

  useEffect(() => {
    if (!eventId) return
    setStream('connecting')
    return openSeatStream(eventId, {
      onStatus: setStream,
      onUpdate: (update) =>
        queryClient.setQueryData<SeatAvailability>(purchaseKeys.seats(eventId), (old) =>
          old ? applySeatUpdate(old, update) : old,
        ),
    })
  }, [eventId, queryClient])

  return { ...query, stream }
}

/** Quantidades escolhidas por tipo de ingresso (por evento), persistidas. */
export function useCart(slug: string) {
  const [cart, setCart] = useLocalStorage<Record<string, number>>(`tf:cart:${slug}`, {})
  const setQuantity = useCallback(
    (typeId: string, qty: number) =>
      setCart((c) => {
        const next = { ...c, [typeId]: qty }
        if (qty <= 0) delete next[typeId]
        return next
      }),
    [setCart],
  )
  const clear = useCallback(() => setCart({}), [setCart])
  return { cart, setQuantity, clear }
}

/**
 * Chave de idempotência estável enquanto a "intenção" não muda: repetir a
 * mesma chamada (ex.: após falha de rede) devolve o mesmo resultado, sem duplicar.
 */
export function useIdempotencyKey(signature: string) {
  const ref = useRef({ signature: '', key: '' })
  if (ref.current.signature !== signature) ref.current = { signature, key: newIdempotencyKey() }
  const reset = useCallback(() => {
    ref.current = { signature: '', key: '' }
  }, [])
  return { key: ref.current.key, reset }
}

export function useOrders() {
  return useQuery({ queryKey: purchaseKeys.orders(), queryFn: ({ signal }) => ordersService.list(signal) })
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: purchaseKeys.order(id),
    queryFn: ({ signal }) => ordersService.get(id, signal),
    // Pix/boleto: acompanha a confirmação do pagamento (no real, o webhook atualiza o pedido).
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 5000 : false),
  })
}

export function useTickets() {
  return useQuery({ queryKey: purchaseKeys.tickets(), queryFn: ({ signal }) => ticketsService.list(signal) })
}

export function useTicket(id: string) {
  return useQuery({ queryKey: purchaseKeys.ticket(id), queryFn: ({ signal }) => ticketsService.get(id, signal) })
}
