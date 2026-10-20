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
    <ol aria-label="Etapas da compra" className="m-0 flex list-none gap-1 rounded-card border border-line bg-card p-1 shadow-xs">
      {steps.map((label, i) => {
        const done = completed || i < current
        const active = !completed && i === current
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'transition-control flex flex-1 items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-semibold lg:px-6',
              active ? 'bg-text text-bg shadow-sm' : done ? 'text-text' : 'text-neutral-600',
              !active && 'max-lg:justify-center',
            )}
          >
            <span
              className={cn(
                'tabular grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                active ? 'bg-accent-600 text-white' : done ? 'bg-success/12 text-success' : 'bg-neutral-200',
              )}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
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
