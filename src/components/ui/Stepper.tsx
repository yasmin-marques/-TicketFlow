import { cn } from '@/lib/cn'

interface StepperProps {
  steps: ReadonlyArray<string>
  /** Índice da etapa atual (0-based). */
  current: number
  /** Marca todas como concluídas (confirmação do pedido). */
  completed?: boolean
}

/** Stepper do checkout: 01 Ingressos · 02 Dados · 03 Pagamento · 04 Confirmação. */
export function Stepper({ steps, current, completed }: StepperProps) {
  return (
    <ol aria-label="Etapas da compra" className="m-0 flex list-none border-b-2 border-divider p-0">
      {steps.map((label, i) => {
        const done = completed || i < current
        const active = !completed && i === current
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex flex-1 items-center gap-2.5 border-r border-neutral-400 px-3 py-3.5 text-[13px] font-semibold last:border-r-0 lg:px-10',
              active ? 'bg-text text-bg' : done ? 'text-text' : 'text-neutral-700',
              !active && 'max-lg:justify-center',
            )}
          >
            <span className="font-mono text-[11px]">{String(i + 1).padStart(2, '0')}</span>
            <span className={cn(!active && 'max-sm:sr-only')}>
              {label}
              {done && <span aria-hidden> ✓</span>}
              {done && <span className="sr-only"> (concluído)</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
