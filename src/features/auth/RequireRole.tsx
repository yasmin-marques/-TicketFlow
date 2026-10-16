import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { StatusPanel } from '@/components/domain/StatusPanel'
import type { UserRole } from '@/types/auth'
import { useAuth } from './AuthProvider'

/**
 * Guard de rota por papel. É só conveniência de UX: o backend precisa
 * validar o papel em TODA rota `/org/**` (o mock devolve 403).
 */
export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { status, user } = useAuth()
  const location = useLocation()
  if (status === 'anonymous') {
    return <Navigate to={`/entrar?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }
  if (!user || !roles.includes(user.role ?? 'USER')) return <Forbidden />
  return <Outlet />
}

function Forbidden() {
  return (
    <StatusPanel
      code="403"
      title="Esta área é para organizadores."
      description="Sua conta não tem acesso ao painel do organizador. Entre com uma conta de organizador para continuar."
      actions={
        <>
          <Button to="/" size="lg">
            Voltar ao início
          </Button>
          <Link to="/entrar" className="inline-flex items-center font-semibold">
            Trocar de conta
          </Link>
        </>
      }
    />
  )
}
