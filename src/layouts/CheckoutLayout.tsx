import { X } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { Logo } from '@/components/ui/Logo'
import { Stepper } from '@/components/ui/Stepper'
import { Countdown, useReservationWarning } from '@/features/reservation/Countdown'
import { ReservationProvider, useReservation } from '@/features/reservation/ReservationProvider'

export const CHECKOUT_STEPS = ['Ingressos', 'Dados', 'Pagamento', 'Confirmação'] as const

/** Etapa atual a partir da URL: ingressos/assentos → 0, /checkout/:id → 1, …/pagamento → 2. */
function stepFromPath(pathname: string): number {
  if (pathname.startsWith('/checkout/')) return pathname.endsWith('/pagamento') ? 2 : 1
  return 0
}

function ExpiryWarning() {
  const { reservation } = useReservation()
  const warn = useReservationWarning(reservation?.status === 'active' ? reservation.expiresAt : undefined)
  if (!warn || !reservation) return null
  return (
    <Container className="pt-4">
      <div role="alert" className="border-2 border-warning px-3.5 py-3 text-[13px]">
        <b className="text-warning">
          <span aria-hidden>! </span>Faltam <Countdown expiresAt={reservation.expiresAt} />
        </b>{' '}
        para sua reserva expirar. Você ainda pode concluir.
      </div>
    </Container>
  )
}

function Shell() {
  const { pathname } = useLocation()
  const { reservation, release } = useReservation()
  const exitTo = reservation ? `/eventos/${reservation.eventSlug}` : '/eventos'

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between border-b-2 border-divider px-4 lg:h-16 lg:px-10">
        <Logo size="sm" />
        <Link
          to={exitTo}
          onClick={() => void release()}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-text no-underline hover:text-accent"
        >
          <X size={14} aria-hidden /> Sair da compra
        </Link>
      </header>
      <Stepper steps={CHECKOUT_STEPS} current={stepFromPath(pathname)} />
      <ExpiryWarning />
      <main id="conteudo" className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

/** Layout da jornada de compra: stepper, aviso de expiração e modal de reserva expirada. */
export function CheckoutLayout() {
  return (
    <ReservationProvider>
      <Shell />
    </ReservationProvider>
  )
}
