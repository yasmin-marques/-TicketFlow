import type { ReactNode } from 'react'
import { Container } from '../ui/Container'
import { cn } from '@/lib/cn'

interface StatusPanelProps {
  /** Código grande: "404", "500". */
  code: string
  title: string
  description: string
  /** Referência para suporte (erro 500). */
  reference?: string
  actions: ReactNode
  tone?: 'default' | 'error'
}

/** Página de estado do sistema (404/500), com o numeral de 180px do protótipo. */
export function StatusPanel({ code, title, description, reference, actions, tone = 'default' }: StatusPanelProps) {
  return (
    <Container className="flex min-h-[420px] flex-col py-12 lg:py-14">
      <div
        aria-hidden
        className={cn(
          'text-[104px] leading-[0.85] font-extrabold tracking-[-0.06em] lg:text-[180px]',
          tone === 'error' && 'text-accent',
        )}
      >
        {code}
      </div>
      <h1 className="mt-7 mb-2 text-[28px] lg:text-[32px]">{title}</h1>
      <p className="max-w-[420px]">{description}</p>
      {reference && <div className="text-muted mt-2 font-mono text-xs font-semibold">{reference}</div>}
      <div className="mt-8 flex flex-wrap gap-2">{actions}</div>
    </Container>
  )
}
