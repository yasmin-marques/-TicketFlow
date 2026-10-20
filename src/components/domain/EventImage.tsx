import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { categoryVisual, placeholderCover } from './categoryVisuals'

/**
 * Proporções padronizadas das capas. `fill` não impõe proporção: a imagem
 * ocupa o tamanho que o pai der (hero, banners com altura fixa).
 */
const RATIOS = {
  card: 'aspect-[4/3]',
  wide: 'aspect-[16/9]',
  square: 'aspect-square',
  fill: '',
} as const

export type EventImageRatio = keyof typeof RATIOS

type LoadState = 'loading' | 'loaded'

interface EventImageProps {
  /** `coverUrl` do evento (contrato da API). `null` = sem capa → fallback. */
  src: string | null
  /**
   * Texto alternativo. Vazio (padrão) quando o título do evento já acompanha a
   * imagem — cards e listas — para o leitor de tela não repetir o título.
   */
  alt?: string
  /** Slug da categoria: define o visual do fallback. */
  category?: string
  ratio?: EventImageRatio
  /** Imagem acima da dobra (hero, capa do detalhe): carrega já e com prioridade. */
  priority?: boolean
  /** Atributo `sizes` para quando a API passar a enviar variantes (`srcSet`). */
  sizes?: string
  srcSet?: string
  /** Tamanho do ícone do fallback. */
  fallbackSize?: 'sm' | 'md' | 'lg'
  className?: string
  imgClassName?: string
  /** Sobreposições (badges, gradiente, botões). */
  children?: ReactNode
}

const ICON_SIZES = { sm: 18, md: 34, lg: 64 } as const

/**
 * Capa do evento com proporção fixa (sem salto de layout), skeleton enquanto
 * carrega, fade-in ao concluir e fallback visual da categoria quando a capa
 * não existe ou falha ao carregar.
 */
export function EventImage({
  src,
  alt = '',
  category,
  ratio = 'fill',
  priority = false,
  sizes,
  srcSet,
  fallbackSize = 'md',
  className,
  imgClassName,
  children,
}: EventImageProps) {
  /*
   * Ordem de tentativa: capa da API → capa temporária local da categoria →
   * fallback desenhado. Cada erro de carregamento avança para a próxima.
   */
  const placeholder = placeholderCover(category)
  const candidates = [src, placeholder].filter((u, i, all): u is string => !!u && all.indexOf(u) === i)
  const candidatesKey = candidates.join('|')
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState>('loading')
  const imgRef = useRef<HTMLImageElement>(null)
  const current = candidates[attempt]

  // Novas URLs → recomeça da primeira.
  useEffect(() => {
    setAttempt(0)
  }, [candidatesKey])

  // Imagem já em cache pode ter terminado antes do efeito.
  useEffect(() => {
    const img = imgRef.current
    if (!current) return
    if (img?.complete) {
      if (img.naturalWidth > 0) setState('loaded')
      else setAttempt((a) => a + 1)
    } else setState('loading')
  }, [current])

  const showFallback = !current

  return (
    <div className={cn('relative isolate overflow-hidden bg-neutral-200', RATIOS[ratio], className)}>
      {showFallback ? (
        <EventCoverFallback category={category} alt={alt} size={fallbackSize} />
      ) : (
        <>
          {state === 'loading' && <div aria-hidden className="skeleton absolute inset-0 rounded-none" />}
          <img
            ref={imgRef}
            src={current}
            // Variantes só existem para a capa da API.
            srcSet={current === src ? srcSet : undefined}
            sizes={current === src ? sizes : undefined}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            onLoad={() => setState('loaded')}
            onError={() => setAttempt((a) => a + 1)}
            className={cn(
              'absolute inset-0 size-full object-cover transition-[opacity,transform] duration-500 ease-out',
              state === 'loaded' ? 'opacity-100' : 'opacity-0',
              imgClassName,
            )}
          />
        </>
      )}
      {children}
    </div>
  )
}

/**
 * Capa de fallback: gradiente e ícone da categoria (só cores da paleta) com
 * as linhas de "fluxo" da marca. Decorativa, a menos que receba `alt`.
 */
export function EventCoverFallback({
  category,
  alt = '',
  size = 'md',
  className,
}: {
  category?: string
  alt?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const { icon: Icon, gradient } = categoryVisual(category)
  const a11y = alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true }
  return (
    <div
      {...a11y}
      className={cn('absolute inset-0 grid place-items-center overflow-hidden text-bg', className)}
      style={{ background: gradient } as CSSProperties}
    >
      <svg aria-hidden className="absolute inset-0 size-full opacity-[0.16]" preserveAspectRatio="none" viewBox="0 0 400 300">
        <path d="M-20 230 C 90 170, 170 300, 420 150" fill="none" stroke="currentColor" strokeWidth="26" strokeLinecap="round" />
        <path d="M-20 290 C 110 230, 200 330, 420 220" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
        <path d="M-20 140 C 120 100, 210 200, 420 70" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <Icon aria-hidden size={ICON_SIZES[size]} strokeWidth={1.6} className="relative opacity-85 drop-shadow-sm" />
    </div>
  )
}
