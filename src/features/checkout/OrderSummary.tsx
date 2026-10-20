import type { ReactNode } from 'react'
import { formatPrice } from '@/lib/format'
import { cn } from '@/lib/cn'

export interface SummaryLine {
  label: ReactNode
  amount: number
}

interface OrderSummaryProps {
  title?: string
  eventTitle?: string
  eventMeta?: string
  lines: SummaryLine[]
  fee: number
  feeLabel?: string
  total: number
  /** Contador da reserva, à direita do título. */
  timer?: ReactNode
  /** Conteúdo extra entre as linhas e o total (ex.: barra de tempo). */
  extra?: ReactNode
  /** Botão de ação no rodapé. */
  children?: ReactNode
  sticky?: boolean
  className?: string
}

/** Resumo do pedido, reutilizado em ingressos, assentos e checkout (um só componente). */
export function OrderSummary({
  title = 'Resumo',
  eventTitle,
  eventMeta,
  lines,
  fee,
  feeLabel = 'Taxa de serviço',
  total,
  timer,
  extra,
  children,
  sticky,
  className,
}: OrderSummaryProps) {
  return (
    <section aria-label="Resumo do pedido" className={cn('surface p-[22px]', sticky && 'sticky top-4', className)}>
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 text-[13px] tracking-[0.08em] uppercase">{title}</h2>
        {timer && <span className="text-lg">{timer}</span>}
      </div>
      {eventTitle && <div className="mt-3 mb-0.5 text-[17px] font-extrabold">{eventTitle}</div>}
      {eventMeta && <div className="text-muted mb-3 text-[13px]">{eventMeta}</div>}

      <div className={cn(!eventTitle && 'mt-2.5')}>
        {lines.length === 0 ? (
          <div className="text-muted border-t border-line py-3 text-sm">Nenhum ingresso selecionado.</div>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="flex justify-between gap-3 border-t border-line py-2.5">
              <span>{l.label}</span>
              <b className="tabular shrink-0">{formatPrice(l.amount)}</b>
            </div>
          ))
        )}
        <div className="flex justify-between border-t border-line py-2.5">
          <span className="text-muted">{feeLabel}</span>
          <span className="tabular">{formatPrice(fee)}</span>
        </div>
      </div>

      {extra}

      <div className="flex items-baseline justify-between border-t border-divider pt-3.5">
        <b>Total</b>
        <b className="tabular text-[30px]" aria-live="polite">
          {formatPrice(total)}
        </b>
      </div>
      {children && <div className="mt-[18px]">{children}</div>}
    </section>
  )
}
