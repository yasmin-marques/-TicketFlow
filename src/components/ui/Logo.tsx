import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'

/*
 * Ponto único da marca. Header, painel do organizador, telas de acesso e
 * rodapé usam estes componentes; trocar a identidade (ver docs/brand/) é
 * trocar `LogoMark` e o wordmark aqui, mais `public/favicon.svg`.
 */

interface LogoMarkProps {
  size?: number
  className?: string
}

/** Ícone reduzido da marca (sidebar recolhida, favicon, avatares de app). */
export function LogoMark({ size = 14, className }: LogoMarkProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={cn('shrink-0 text-accent', className)}
    >
      <rect width="16" height="16" rx="3.5" fill="currentColor" />
    </svg>
  )
}

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  /** Rótulo de contexto ao lado do wordmark (ex.: "Organizador"). */
  badge?: string
  /** Destino do link; `null` renderiza sem link (ex.: dentro de outro link). */
  to?: string | null
  /** `inverse` para fundos escuros. */
  tone?: 'default' | 'inverse'
  className?: string
}

const SIZES = {
  sm: { text: 'text-lg', mark: 12 },
  md: { text: 'text-xl', mark: 14 },
  lg: { text: 'text-[26px]', mark: 18 },
} as const

/** Logo horizontal: ícone + wordmark "ticketflow". */
export function Logo({ size = 'md', badge, to = '/', tone = 'default', className }: LogoProps) {
  const s = SIZES[size]
  const content = (
    <>
      <LogoMark size={s.mark} />
      <span>ticketflow</span>
      {badge && (
        <span
          className={cn(
            'ml-0.5 rounded-chip px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase',
            tone === 'inverse' ? 'bg-bg/12 text-neutral-300' : 'bg-text/7 text-neutral-700',
          )}
        >
          {badge}
        </span>
      )}
    </>
  )
  const classes = cn(
    'flex items-center gap-2 font-extrabold tracking-[-0.03em] no-underline',
    tone === 'inverse' ? 'text-bg' : 'text-text',
    s.text,
    className,
  )
  if (to === null) return <span className={classes}>{content}</span>
  return (
    <Link to={to} aria-label="TicketFlow — página inicial" className={cn(classes, 'transition-opacity hover:opacity-80')}>
      {content}
    </Link>
  )
}
