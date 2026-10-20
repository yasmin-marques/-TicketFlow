import { Link } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { Logo } from '@/components/ui/Logo'
import { cn } from '@/lib/cn'

const links = [
  { to: '/organizadores', label: 'Para organizadores' },
  { to: '/ajuda', label: 'Ajuda' },
  { to: '/termos', label: 'Termos' },
  { to: '/privacidade', label: 'Privacidade' },
]

export function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn('mt-6 border-t border-line bg-card/60 py-6', className)}>
      <Container className="text-muted flex flex-col justify-between gap-3 text-[13px] sm:flex-row sm:items-center">
        <span className="flex items-center gap-3">
          <Logo size="sm" />
          <span>© {new Date().getFullYear()} TicketFlow</span>
        </span>
        <nav aria-label="Institucional" className="flex flex-wrap gap-x-3">
          {links.map((l, i) => (
            <span key={l.to}>
              <Link to={l.to} className="text-muted no-underline hover:text-accent hover:underline">
                {l.label}
              </Link>
              {i < links.length - 1 && <span aria-hidden> ·</span>}
            </span>
          ))}
        </nav>
      </Container>
    </footer>
  )
}
