import { cn } from '@/lib/cn'

/* Gráficos do painel: CSS/SVG puro com os tokens do design system (sem biblioteca). */

interface BarChartProps {
  data: Array<{ label: string; value: number }>
  /** Barra destacada em accent (ex.: o pico). */
  highlight?: number
  height?: number
  /** Resumo para leitores de tela. */
  summary: string
  formatValue?: (v: number) => string
  className?: string
}

/** Barras verticais sobre régua de 2px, com linha tracejada no topo (bloco "Vendas por período"). */
export function BarChart({ data, highlight, height = 190, summary, formatValue = String, className }: BarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className={className}>
      <div
        role="img"
        aria-label={summary}
        className="flex items-end gap-1 border-t border-dashed border-neutral-400 border-b-2 border-b-text"
        style={{ height }}
      >
        {data.map((d, i) => (
          <div
            key={`${d.label}-${i}`}
            title={`${d.label}: ${formatValue(d.value)}`}
            className={cn('min-w-px flex-1 transition-opacity hover:opacity-70', i === highlight ? 'bg-accent' : 'bg-text')}
            style={{ height: `${Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  )
}

interface LineChartProps {
  points: number[]
  goal?: number
  summary: string
  height?: number
}

/** Linha acumulada vs. meta tracejada (bloco "Evolução das vendas"). */
export function LineChart({ points, goal, summary, height = 150 }: LineChartProps) {
  const W = 550
  const H = 130
  const top = 20
  const max = Math.max(1, goal ?? 0, ...points)
  const y = (v: number) => H - 14 - (v / max) * (H - 14 - top + 4)
  const step = points.length > 1 ? W / (points.length - 1) : W
  const line = points.map((p, i) => `${(i * step).toFixed(1)},${y(p).toFixed(1)}`).join(' ')
  return (
    <svg
      role="img"
      aria-label={summary}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full overflow-visible border-b-2 border-text"
      style={{ height }}
    >
      {goal !== undefined && (
        <line x1="0" y1={y(goal)} x2={W} y2={y(goal)} stroke="#9b9797" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
      )}
      {points.length > 1 && (
        <polyline points={line} fill="none" stroke="#201e1d" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      )}
    </svg>
  )
}

interface HBarListProps {
  items: Array<{ label: string; value: number; display: string }>
  /** Largura de 100% corresponde a este valor (padrão: o maior). */
  max?: number
  labelWidth?: number
  valueWidth?: number
}

/** Barras horizontais com rótulo e valor (bloco "Receita por evento"). */
export function HBarList({ items, max, labelWidth = 110, valueWidth = 70 }: HBarListProps) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="m-0 list-none p-0">
      {items.map((i) => (
        <li
          key={i.label}
          className="grid items-center gap-2.5 py-[5px] text-[12.5px]"
          style={{ gridTemplateColumns: `${labelWidth}px 1fr ${valueWidth}px` }}
        >
          <span className="truncate" title={i.label}>
            {i.label}
          </span>
          <div className="h-3 bg-neutral-300" role="presentation">
            <div className="h-full bg-text" style={{ width: `${Math.min(100, (i.value / top) * 100)}%` }} />
          </div>
          <b className="tabular text-right">{i.display}</b>
        </li>
      ))}
    </ul>
  )
}

const STACK_COLORS = ['bg-text', 'bg-accent', 'bg-neutral-400', 'bg-neutral-600', 'bg-neutral-200']

/** Barra empilhada com legenda (bloco "Ingressos por tipo"). */
export function StackedBar({ items }: { items: Array<{ name: string; value: number }> }) {
  const total = items.reduce((n, i) => n + i.value, 0)
  return (
    <div>
      <div role="img" aria-label={items.map((i) => `${i.name}: ${i.value}`).join(', ')} className="my-3 flex h-[34px]">
        {items.map((i, idx) => (
          <div key={i.name} className={STACK_COLORS[idx % STACK_COLORS.length]} style={{ width: `${total ? (i.value / total) * 100 : 0}%` }} title={`${i.name}: ${i.value}`} />
        ))}
      </div>
      <ul className="m-0 grid list-none grid-cols-[14px_1fr_auto] items-center gap-x-2.5 gap-y-2 p-0 text-[13px]">
        {items.map((i, idx) => (
          <li key={i.name} className="contents">
            <i className={cn('h-3', STACK_COLORS[idx % STACK_COLORS.length])} />
            <span>{i.name}</span>
            <b className="tabular">{i.value.toLocaleString('pt-BR')}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Barra de progresso fina (ocupação, lotes). */
export function ProgressBar({ pct, className, tone = 'text' }: { pct: number; className?: string; tone?: 'text' | 'accent' | 'success' }) {
  return (
    <div role="presentation" className={cn('h-1.5 bg-neutral-300', className)}>
      <div
        className={cn('h-full', tone === 'text' ? 'bg-text' : tone === 'accent' ? 'bg-accent' : 'bg-success')}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  )
}
