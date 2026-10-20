import { Link, NavLink } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Logo'
import { useAuth } from '@/features/auth/AuthProvider'
import { SearchBox } from '@/features/search/SearchBox'
import { cn } from '@/lib/cn'

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'transition-control flex items-center rounded-full px-3.5 py-1.5 text-sm font-semibold no-underline',
    isActive ? 'bg-text text-bg' : 'text-neutral-700 hover:bg-text/6 hover:text-text',
  )

/** "Camila Duarte" → "CD" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase()
}

/** Header desktop: logo, navegação, busca e área do usuário (entrar ou ingressos + avatar). */
export function SiteHeader({ className }: { className?: string }) {
  const { user } = useAuth()
  return (
    <header className={cn('glass-bar sticky top-0 z-30 h-16 items-center gap-6 px-10', className)}>
      <Logo />
      <nav aria-label="Principal" className="flex items-center gap-1">
        <NavLink to="/eventos" className={navLink}>
          Eventos
        </NavLink>
        <NavLink to="/categorias" className={navLink}>
          Categorias
        </NavLink>
      </nav>
      <SearchBox className="ml-auto max-w-[380px] flex-1" />
      {user ? (
        <>
          {(user.role === 'ORGANIZER' || user.role === 'ADMIN') && (
            <Link to="/org/dashboard" className="transition-control rounded-full px-3 py-1.5 text-sm font-semibold text-accent-700 no-underline hover:bg-accent/8">
              Painel
            </Link>
          )}
          <Link to="/meus-ingressos" className="transition-control rounded-full px-3 py-1.5 text-sm font-semibold text-text no-underline hover:bg-text/6">
            Meus ingressos
          </Link>
          <Link
            to="/conta"
            aria-label={`Minha conta — ${user.name}`}
            className="transition-control flex size-[36px] items-center justify-center rounded-full bg-text text-[13px] font-extrabold text-bg no-underline hover:bg-neutral-800 hover:shadow-md"
          >
            {initials(user.name)}
          </Link>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <Link to="/entrar" className="transition-control rounded-full px-3.5 py-1.5 text-sm font-semibold text-text no-underline hover:bg-text/6">
            Entrar
          </Link>
          <Button to="/cadastro">Criar conta</Button>
        </div>
      )}
    </header>
  )
}
