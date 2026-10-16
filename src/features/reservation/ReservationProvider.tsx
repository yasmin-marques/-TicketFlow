import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { reservationsService } from '@/services/api/purchase.service'
import type { Reservation } from '@/types/purchase'
import { purchaseKeys } from '../purchase/hooks'
import {
  clearActiveReservation,
  getActiveReservationId,
  setActiveReservation,
  subscribeActiveReservation,
} from './activeReservation'

export const WARNING_THRESHOLD_MS = 2 * 60_000

interface ReservationContextValue {
  reservation: Reservation | null
  isLoading: boolean
  /** Define a reserva ativa (resposta de POST/PUT) e atualiza o cache. */
  setReservation: (reservation: Reservation) => void
  /** Aponta para uma reserva existente (ex.: URL do checkout). */
  activate: (id: string) => void
  /** Libera no servidor e esquece a reserva. */
  release: () => Promise<void>
  /** Esquece a reserva localmente (concluída ou substituída). */
  forget: () => void
  /** Chamado quando o servidor responde que a reserva expirou. */
  markExpired: () => void
}

const ReservationContext = createContext<ReservationContextValue | null>(null)

/**
 * Único "store" da reserva (mapa de assentos e checkout compartilham o mesmo
 * prazo). O contador deriva sempre de `expiresAt` do servidor — nunca de um
 * contador local — e o modal de expiração vive aqui.
 */
export function ReservationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const activeId = useSyncExternalStore(subscribeActiveReservation, getActiveReservationId)
  const [expired, setExpired] = useState<Reservation | null>(null)

  const { data, isPending } = useQuery({
    queryKey: purchaseKeys.reservation(activeId ?? ''),
    queryFn: ({ signal }) => reservationsService.get(activeId!, signal),
    enabled: !!activeId,
    staleTime: Infinity,
    retry: false,
  })

  const reservation = activeId && data && data.status !== 'released' ? data : null

  const markExpired = useCallback(() => {
    if (reservation) setExpired(reservation)
  }, [reservation])

  // Reserva já vencida ao carregar a página (ex.: voltou à aba depois de muito tempo).
  useEffect(() => {
    if (data?.status === 'expired') setExpired(data)
  }, [data])

  // Dispara o modal quando o prazo chega a zero.
  useEffect(() => {
    if (!reservation || reservation.status !== 'active') return
    const ms = new Date(reservation.expiresAt).getTime() - Date.now()
    const id = window.setTimeout(() => setExpired(reservation), Math.max(0, ms))
    return () => window.clearTimeout(id)
  }, [reservation])

  const setReservation = useCallback(
    (next: Reservation) => {
      queryClient.setQueryData(purchaseKeys.reservation(next.id), next)
      setActiveReservation(next.id)
      setExpired(null)
    },
    [queryClient],
  )

  const forget = useCallback(() => clearActiveReservation(), [])

  const release = useCallback(async () => {
    const id = getActiveReservationId()
    clearActiveReservation()
    if (id) {
      try {
        await reservationsService.release(id)
      } catch {
        /* se falhar, o prazo libera de qualquer forma */
      }
    }
  }, [])

  const value = useMemo<ContextValue>(
    () => ({
      reservation,
      isLoading: !!activeId && isPending,
      setReservation,
      activate: setActiveReservation,
      release,
      forget,
      markExpired,
    }),
    [reservation, activeId, isPending, setReservation, release, forget, markExpired],
  )

  const seats = expired?.items.flatMap((i) => i.seatIds) ?? []
  const hadSeats = seats.length > 0
  const slug = expired?.eventSlug

  const backToSelection = () => {
    clearActiveReservation()
    setExpired(null)
    navigate(`/eventos/${slug}/${hadSeats ? 'assentos' : 'ingressos'}`)
  }
  const leave = () => {
    clearActiveReservation()
    setExpired(null)
    navigate(`/eventos/${slug}`)
  }

  return (
    <ReservationContext.Provider value={value}>
      {children}
      <Modal open={!!expired} onClose={leave} title="Sua reserva expirou" dismissible={false}>
        <p className="text-muted text-sm">
          {hadSeats
            ? `Liberamos os assentos ${seats.join(' e ')} para outras pessoas. Se ainda estiverem livres, você pode escolhê-los de novo.`
            : 'Liberamos seus ingressos para outras pessoas. Se ainda houver disponibilidade, você pode escolher de novo.'}
        </p>
        <div className="mt-4 flex gap-2">
          <Button onClick={backToSelection}>{hadSeats ? 'Voltar ao mapa' : 'Escolher ingressos'}</Button>
          <Button variant="secondary" onClick={leave}>
            Sair
          </Button>
        </div>
      </Modal>
    </ReservationContext.Provider>
  )
}

type ContextValue = ReservationContextValue

export function useReservation(): ReservationContextValue {
  const ctx = useContext(ReservationContext)
  if (!ctx) throw new Error('useReservation deve ser usado dentro de <ReservationProvider>')
  return ctx
}
