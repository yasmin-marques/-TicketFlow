import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'

interface LogoProps {
  size?: 'sm' | 'md'
  className?: string
}

export function Logo({ size = 'md', className }: LogoProps) {
  return (
    <Link
      to="/"
      aria-label="TicketFlow — página inicial"
      className={cn(
        'flex items-center gap-2 font-extrabold tracking-[-0.03em] text-text no-underline',
        size === 'md' ? 'text-xl' : 'text-lg',
        className,
      )}
    >
      <span aria-hidden className={cn('bg-accent', size === 'md' ? 'size-3.5' : 'size-3')} />
      ticketflow
    </Link>
  )
}
