import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'error' | 'warning'

interface AlertProps {
  tone?: Tone
  title: string
  children?: ReactNode
  className?: string
}

const tones: Record<Tone, { box: string; title: string; glyph: string }> = {
  error: { box: 'border-accent-300 bg-accent-100', title: 'text-accent-700', glyph: '✕' },
  warning: { box: 'border-warning/30 bg-warning/8', title: 'text-warning', glyph: '!' },
}

/** Alerta em linha. Nunca só cor: sempre ícone + texto (regra do protótipo). */
export function Alert({ tone = 'error', title, children, className }: AlertProps) {
  const t = tones[tone]
  return (
    <div role="alert" className={cn('rounded-card border px-4 py-3 text-[13px]', t.box, className)}>
      <b className={t.title}>
        <span aria-hidden>{t.glyph} </span>
        {title}
      </b>
      {children && <div>{children}</div>}
    </div>
  )
}
