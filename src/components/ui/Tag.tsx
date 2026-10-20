import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'accent' | 'neutral' | 'outline' | 'dark'

const tones: Record<Tone, string> = {
  accent: 'bg-accent-100 text-accent-800 ring-1 ring-accent-200 ring-inset',
  neutral: 'bg-neutral-100 text-neutral-800 ring-1 ring-neutral-300 ring-inset',
  outline: 'border border-accent text-accent-700',
  dark: 'bg-text/90 text-bg backdrop-blur-sm',
}

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

/** Badge em pílula (ex.: "Últimos ingressos", "Esgotado"). */
export function Tag({ tone = 'accent', className, ...rest }: TagProps) {
  return (
    <span
      className={cn('inline-flex items-center rounded-chip px-2.5 py-[3px] text-[11px] font-semibold tracking-[0.02em]', tones[tone], className)}
      {...rest}
    />
  )
}
