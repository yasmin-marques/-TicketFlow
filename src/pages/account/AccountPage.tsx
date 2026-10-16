import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LoadError } from '@/components/domain/LoadError'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/features/auth/AuthProvider'
import { NotificationsTab } from '@/features/account/NotificationsTab'
import { PaymentsTab } from '@/features/account/PaymentsTab'
import { ProfileTab } from '@/features/account/ProfileTab'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
import { accountService } from '@/services/api/account.service'

const TABS = [
  { key: 'perfil', label: 'Perfil' },
  { key: 'pagamentos', label: 'Pagamentos' },
  { key: 'notificacoes', label: 'Notificações' },
] as const

/** /conta — perfil, formas de pagamento e notificações do comprador. */
export function AccountPage() {
  useDocumentTitle('Minha conta')
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { logout } = useAuth()
  const active = TABS.find((t) => t.key === params.get('aba')) ?? TABS[0]
  const profile = useQuery({ queryKey: ['me'], queryFn: ({ signal }) => accountService.profile(signal) })

  return (
    <Container className="py-6 lg:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="m-0 text-[32px] lg:text-[42px]">Minha conta</h1>
        <div className="flex gap-4 text-sm font-semibold">
          <Link to="/meus-ingressos">Meus ingressos</Link>
          <Link to="/pedidos">Pedidos</Link>
        </div>
      </div>

      <div role="tablist" aria-label="Seções da conta" className="mt-3 flex gap-7 overflow-x-auto border-b-2 border-divider">
        {TABS.map((t) => {
          const selected = t.key === active.key
          return (
            <button
              key={t.key}
              role="tab"
              id={`acc-${t.key}`}
              aria-selected={selected}
              aria-controls="acc-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setParams(t.key === 'perfil' ? {} : { aba: t.key }, { replace: true })}
              className={cn(
                '-mb-0.5 py-2.5 text-[15px] whitespace-nowrap',
                selected ? 'border-b-4 border-accent font-extrabold' : 'text-muted font-semibold hover:text-text',
              )}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div id="acc-panel" role="tabpanel" aria-labelledby={`acc-${active.key}`} className="max-w-[700px] pt-6">
        {profile.error ? (
          <LoadError title="Não foi possível carregar sua conta." error={profile.error} onRetry={() => profile.refetch()} />
        ) : profile.isPending ? (
          <div aria-busy="true" aria-label="Carregando conta" className="space-y-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : active.key === 'perfil' ? (
          <ProfileTab profile={profile.data} />
        ) : active.key === 'pagamentos' ? (
          <PaymentsTab />
        ) : (
          <NotificationsTab profile={profile.data} />
        )}
      </div>

      <div className="mt-10 max-w-[700px] border-t-2 border-divider pt-4">
        <Button
          variant="secondary"
          onClick={async () => {
            await logout()
            navigate('/', { replace: true })
          }}
        >
          Sair da conta
        </Button>
      </div>
    </Container>
  )
}
