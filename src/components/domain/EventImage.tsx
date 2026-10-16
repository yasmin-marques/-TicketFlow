import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface EventImageProps {
  src: string | null
  className?: string
  /** Espessura das listras do placeholder (px). */
  stripe?: number
  /** Rótulo mono no canto inferior (placeholder de design). */
  label?: string
  children?: ReactNode
}

/**
 * Foto do evento em preto e branco. Sem `src`, mostra o placeholder listrado
 * do protótipo. Decorativa: o título do evento sempre acompanha a imagem.
 */
export function EventImage({ src, className, stripe = 9, label, children }: EventImageProps) {
  return (
    <div
      className={cn('relative overflow-hidden', !src && 'bg-stripes', className)}
      style={!src ? ({ '--stripe': `${stripe}px` } as CSSProperties) : undefined}
    >
      {src && <img src={src} alt="" loading="lazy" className="grayscale-photo size-full object-cover" />}
      {!src && label && (
        <span className="absolute bottom-4 left-4 font-mono text-[11px] font-semibold text-neutral-700">
          {label}
        </span>
      )}
      {children}
    </div>
  )
}
