import { Link, NavLink } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Logo'
import { useAuth } from '@/features/auth/AuthProvider'
import { SearchBox } from '@/features/search/SearchBox'
import { cn } from '@/lib/cn'

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex h-full items-center border-b-2 text-sm font-semibold text-text no-underline transition-colors hover:text-accent',
    isActive ? 'border-accent' : 'border-transparent text-neutral-700',
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
    <header className={cn('h-16 items-stretch gap-8 border-b-2 border-divider bg-bg px-10', className)}>
      <Logo className="self-center" />
      <nav aria-label="Principal" className="flex items-stretch gap-8">
        <NavLink to="/eventos" className={navLink}>
          Eventos
        </NavLink>
        <NavLink to="/categorias" className={navLink}>
          Categorias
        </NavLink>
      </nav>
      <SearchBox className="ml-auto max-w-[380px] flex-1 self-center" />
      {user ? (
        <>
          <Link to="/meus-ingressos" className="flex items-center text-sm font-semibold text-text no-underline hover:text-accent">
            Meus ingressos
          </Link>
          <Link
            to="/conta"
            aria-label={`Minha conta — ${user.name}`}
            className="flex size-[34px] items-center justify-center self-center bg-text text-[13px] font-extrabold text-bg no-underline hover:bg-neutral-800"
          >
            {initials(user.name)}
          </Link>
        </>
      ) : (
        <div className="flex items-center gap-3 self-center">
          <Link to="/entrar" className="text-sm font-semibold text-text no-underline hover:text-accent">
            Entrar
          </Link>
          <Button to="/cadastro">Criar conta</Button>
        </div>
      )}
    </header>
  )
}
