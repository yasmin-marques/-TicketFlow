import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

/** Guard de rota: redireciona para /entrar guardando o destino em `?next=`. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/entrar?next=${next}`} replace />
  }
  return <Outlet />
}

/** Só aceita destinos internos (evita open redirect). */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}
