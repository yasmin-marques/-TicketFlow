import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

interface RangeSliderProps {
  min: number
  max: number
  step?: number
  value: [number, number]
  /** Chamado ao soltar o controle (ou ao usar o teclado). */
  onCommit: (value: [number, number]) => void
  /** Rótulos acessíveis dos dois controles. */
  labels?: [string, string]
  /** Controles maiores para toque (drawer mobile). */
  large?: boolean
}

/** Slider de faixa com dois controles quadrados em accent. */
export function RangeSlider({
  min,
  max,
  step = 5,
  value,
  onCommit,
  labels = ['Valor mínimo', 'Valor máximo'],
  large,
}: RangeSliderProps) {
  const [draft, setDraft] = useState<[number, number]>(value)
  const [lo, hi] = value
  useEffect(() => {
    setDraft([lo, hi])
  }, [lo, hi])

  const pct = (v: number) => ((v - min) / (max - min)) * 100
  const commit = () => onCommit(draft)

  return (
    <div
      className={cn('relative', large ? 'h-6' : 'h-4')}
      style={{ ['--thumb' as string]: large ? '24px' : '16px' }}
    >
      <div aria-hidden className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-neutral-400" />
      <div
        aria-hidden
        className="absolute top-1/2 h-1 -translate-y-1/2 bg-text"
        style={{ left: `${pct(draft[0])}%`, right: `${100 - pct(draft[1])}%` }}
      />
      {([0, 1] as const).map((i) => (
        <input
          key={i}
          type="range"
          className="range-thumb"
          min={min}
          max={max}
          step={step}
          value={draft[i]}
          aria-label={labels[i]}
          aria-valuetext={`R$ ${draft[i]}`}
          onChange={(e) => {
            const v = Number(e.target.value)
            setDraft((d) => (i === 0 ? [Math.min(v, d[1]), d[1]] : [d[0], Math.max(v, d[0])]))
          }}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
      ))}
    </div>
  )
}
