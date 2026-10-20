import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem<T extends string> {
  key: T
  label: ReactNode
  /** Rótulo em texto para leitores de tela quando `label` tem contadores. */
  ariaLabel?: string
}

interface TabsProps<T extends string> {
  tabs: ReadonlyArray<TabItem<T>>
  active: T
  onChange: (key: T) => void
  /** Nome acessível do grupo. */
  label: string
  /** Prefixo dos ids: cada aba é `${idPrefix}-${key}` e o painel deve ser `${idPrefix}-panel`. */
  idPrefix: string
  className?: string
}

/** Abas com régua fina e indicador de 3px em accent (Meus ingressos, Conta, Evento…). Setas ←/→ navegam. */
export function Tabs<T extends string>({ tabs, active, onChange, label, idPrefix, className }: TabsProps<T>) {
  const move = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null
    if (next === null) return
    e.preventDefault()
    const target = tabs[(next + tabs.length) % tabs.length]
    if (!target) return
    onChange(target.key)
    document.getElementById(`${idPrefix}-${target.key}`)?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-7 overflow-x-auto border-b border-divider', className)}>
      {tabs.map((t, i) => {
        const selected = t.key === active
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`${idPrefix}-${t.key}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            aria-label={t.ariaLabel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => move(e, i)}
            className={cn(
              'transition-control relative py-3 text-[15px] whitespace-nowrap after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-t-full after:transition-colors after:content-[""]',
              selected ? 'font-bold after:bg-accent' : 'text-muted font-semibold after:bg-transparent hover:text-text hover:after:bg-text/15',
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
