import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'accent' | 'neutral' | 'outline' | 'dark'

const tones: Record<Tone, string> = {
  accent: 'bg-accent-100 text-accent-800',
  neutral: 'bg-neutral-100 text-neutral-800',
  outline: 'border border-accent text-accent',
  dark: 'bg-text text-bg',
}

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

/** Badge retangular (ex.: "Últimos ingressos", "Esgotado"). */
export function Tag({ tone = 'accent', className, ...rest }: TagProps) {
  return (
    <span
      className={cn('inline-flex items-center px-2.5 py-[3px] text-[11px] tracking-[0.02em]', tones[tone], className)}
      {...rest}
    />
  )
}
