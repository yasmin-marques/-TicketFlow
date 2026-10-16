import { NavLink, Link } from 'react-router-dom'
import { SearchBox } from '@/features/search/SearchBox'
import { MOCK_USER } from '@/mocks/data/user'
import { cn } from '@/lib/cn'
import { Logo } from '@/components/ui/Logo'

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex h-full items-center border-b-2 text-sm font-semibold text-text no-underline transition-colors hover:text-accent',
    isActive ? 'border-accent' : 'border-transparent text-neutral-700',
  )

/** Header desktop: logo, navegação, busca, "Meus ingressos" e avatar. */
export function SiteHeader({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        'h-16 items-stretch gap-8 border-b-2 border-divider bg-bg px-10',
        className,
      )}
    >
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
      <Link
        to="/meus-ingressos"
        className="flex items-center text-sm font-semibold text-text no-underline hover:text-accent"
      >
        Meus ingressos
      </Link>
      <Link
        to="/conta"
        aria-label={`Minha conta — ${MOCK_USER.name}`}
        className="flex size-[34px] items-center justify-center self-center bg-text text-[13px] font-extrabold text-bg no-underline hover:bg-neutral-800"
      >
        {MOCK_USER.initials}
      </Link>
    </header>
  )
}
