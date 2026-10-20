import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useMediaQuery } from './useMediaQuery'

interface CarouselOptions {
  total: number
  /** Intervalo do avanço automático (ms). */
  interval?: number
  /** Deslocamento horizontal mínimo para contar como swipe (px). */
  swipeThreshold?: number
}

/**
 * Estado e comportamento de um carrossel acessível:
 *
 * - avança sozinho a cada `interval` ms, retomando de onde parou após uma pausa;
 * - pausa com o mouse em cima, com o foco dentro e com a aba oculta;
 * - para de vez quando a pessoa navega (setas, indicadores, teclado, swipe) —
 *   ela assume o controle e pode retomar pelo botão de reproduzir;
 * - não avança sozinho com `prefers-reduced-motion: reduce`;
 * - com um item só, não há avanço nem navegação.
 */
export function useCarousel({ total, interval = 5000, swipeThreshold = 48 }: CarouselOptions) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(!reducedMotion)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden)

  const enabled = total > 1
  const paused = !enabled || !playing || hovered || focused || hidden

  // A preferência pode mudar com a página aberta.
  useEffect(() => {
    if (reducedMotion) setPlaying(false)
  }, [reducedMotion])

  // Lista encolheu (refetch): mantém o índice válido.
  useEffect(() => {
    setIndex((i) => (total > 0 ? Math.min(i, total - 1) : 0))
  }, [total])

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  /* Timer com tempo restante: pausar no meio e retomar não reinicia a contagem. */
  const remaining = useRef(interval)
  // Declarado antes do timer: em cada troca de slide, o reset roda depois da limpeza do timer anterior.
  useEffect(() => {
    remaining.current = interval
  }, [index, interval])

  useEffect(() => {
    if (paused) return
    const startedAt = performance.now()
    const id = window.setTimeout(() => {
      setIndex((i) => (i + 1) % total)
    }, remaining.current)
    return () => {
      window.clearTimeout(id)
      remaining.current = Math.max(0, remaining.current - (performance.now() - startedAt))
    }
  }, [paused, index, total])

  /** Navegação feita pela pessoa: troca o slide e encerra o avanço automático. */
  const goTo = useCallback(
    (next: number) => {
      if (!enabled) return
      setPlaying(false)
      setIndex(((next % total) + total) % total)
    },
    [enabled, total],
  )
  const next = useCallback(() => goTo(index + 1), [goTo, index])
  const prev = useCallback(() => goTo(index - 1), [goTo, index])

  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p) remaining.current = interval
      return !p
    })
  }, [interval])

  /* Swipe (toque/caneta): exige gesto predominantemente horizontal. */
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const swiped = useRef(false)

  const onPointerDown = (e: PointerEvent) => {
    if (!enabled || e.pointerType === 'mouse') return
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    swiped.current = false
  }
  const onPointerUp = (e: PointerEvent) => {
    const s = start.current
    start.current = null
    if (!s || s.id !== e.pointerId) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.abs(dx) >= swipeThreshold && Math.abs(dx) > Math.abs(dy) * 1.2) {
      swiped.current = true
      if (dx < 0) next()
      else prev()
    }
  }
  const onPointerCancel = () => {
    start.current = null
  }
  // O toque que terminou em swipe não deve abrir o link sob o dedo.
  const onClickCapture = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    if (!swiped.current) return
    swiped.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!enabled) return
    const target = e.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return
    const actions: Record<string, () => void> = {
      ArrowRight: next,
      ArrowLeft: prev,
      Home: () => goTo(0),
      End: () => goTo(total - 1),
    }
    const action = actions[e.key]
    if (!action) return
    e.preventDefault()
    action()
  }

  return {
    index,
    total,
    enabled,
    /** Avanço automático ligado (pode estar momentaneamente pausado). */
    playing: enabled && playing,
    paused,
    interval,
    goTo,
    next,
    prev,
    toggle,
    /** Props do elemento raiz do carrossel. */
    rootProps: {
      // Só mouse: no toque, o "hover" emulado nunca termina e travaria a pausa.
      onPointerEnter: (e: PointerEvent) => e.pointerType === 'mouse' && setHovered(true),
      onPointerLeave: (e: PointerEvent) => e.pointerType === 'mouse' && setHovered(false),
      onFocus: () => setFocused(true),
      onBlur: (e: { currentTarget: HTMLElement; relatedTarget: EventTarget | null }) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
      },
      onKeyDown,
    },
    /** Props da área que aceita swipe. */
    swipeProps: { onPointerDown, onPointerUp, onPointerCancel, onClickCapture },
  }
}
