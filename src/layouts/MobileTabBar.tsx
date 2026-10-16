import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/cn'

const items = [
  { to: '/', label: 'Eventos', end: true },
  { to: '/eventos', label: 'Explorar', end: false },
  { to: '/meus-ingressos', label: 'Ingressos', end: false },
  { to: '/conta', label: 'Conta', end: false },
]

/** Navegação inferior do mobile (4 colunas, indicador de 4px em accent). */
export function MobileTabBar({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        'fixed inset-x-0 bottom-0 z-20 grid h-[60px] grid-cols-4 border-t-2 border-text bg-bg text-center text-[11px] font-semibold',
        className,
      )}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'flex items-center justify-center no-underline',
              isActive ? '-mt-0.5 border-t-4 border-accent text-text' : 'text-muted',
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
