import { Compass, House, Ticket, UserRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/cn'

const items = [
  { to: '/', label: 'Eventos', end: true, icon: House },
  { to: '/eventos', label: 'Explorar', end: false, icon: Compass },
  { to: '/meus-ingressos', label: 'Ingressos', end: false, icon: Ticket },
  { to: '/conta', label: 'Conta', end: false, icon: UserRound },
]

/** Navegação inferior do mobile (4 colunas, ícone + rótulo, pílula no item ativo). */
export function MobileTabBar({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        'floating-bar fixed inset-x-0 bottom-0 z-20 grid h-[60px] grid-cols-4 pb-[env(safe-area-inset-bottom)] text-center text-[11px] font-semibold',
        className,
      )}
    >
      {items.map(({ icon: Icon, ...item }) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn('group flex flex-col items-center justify-center gap-0.5 no-underline', isActive ? 'text-text' : 'text-muted')
          }
        >
          {({ isActive }) => (
            <>
              <span
                aria-hidden
                className={cn(
                  'transition-control grid h-7 w-12 place-items-center rounded-full',
                  isActive ? 'bg-accent-100 text-accent-700' : 'group-active:bg-text/6',
                )}
              >
                <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
              </span>
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
