import { Link } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { cn } from '@/lib/cn'

const links = [
  { to: '/organizadores', label: 'Para organizadores' },
  { to: '/ajuda', label: 'Ajuda' },
  { to: '/termos', label: 'Termos' },
  { to: '/privacidade', label: 'Privacidade' },
]

export function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn('border-t-2 border-text py-5', className)}>
      <Container className="text-muted flex flex-col justify-between gap-2 text-[13px] sm:flex-row">
        <span>© {new Date().getFullYear()} TicketFlow</span>
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
