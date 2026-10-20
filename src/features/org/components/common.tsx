import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/format'

/** Cabeçalho de página do painel: H2 + subtítulo à esquerda, ações à direita. */
export function OrgPageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="m-0 text-[26px] lg:text-[30px]">{title}</h2>
        {subtitle && <div className="text-muted text-[13px]">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export interface KpiItem {
  label: string
  value: string
  sub?: ReactNode
}

/** Faixa de indicadores: um card por KPI. */
export function KpiStrip({ items, className }: { items: KpiItem[]; className?: string }) {
  return (
    <dl className={cn('m-0 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4', className)}>
      {items.map((k) => (
        <div key={k.label} className="surface px-4 py-4 lg:px-5 lg:py-[18px]">
          <dt className="text-muted text-xs font-semibold">{k.label}</dt>
          <dd className="tabular m-0 mt-1 text-[26px] leading-[1.1] font-extrabold tracking-[-0.03em] lg:text-[34px]">{k.value}</dd>
          {k.sub && <div className="mt-1 text-xs">{k.sub}</div>}
        </div>
      ))}
    </dl>
  )
}

/** "▲ 12,4% vs. período anterior" em verde; "▼" em accent-700. */
export function Delta({ value, unit = '%', suffix }: { value: number | null; unit?: string; suffix?: string }) {
  if (value === null) return <span className="text-muted">sem período anterior</span>
  const up = value >= 0
  return (
    <span className={cn('font-semibold', up ? 'text-success' : 'text-accent-700')}>
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      <span className="sr-only">{up ? 'aumento de' : 'queda de'}</span> {Math.abs(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
      {unit}
      {suffix && ` ${suffix}`}
    </span>
  )
}

/** "R$ 38.4 mil" para rótulos curtos de gráfico. */
export function compactMoney(v: number): string {
  return v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : formatPrice(v)
}

/** Baixa um CSV gerado no navegador (UTF-8 com BOM, separador `;` para abrir no Excel pt-BR). */
export function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number>>): void {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const body = [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
