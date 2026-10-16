import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  /** Mensagem de sucesso ("✓ CPF válido"). */
  success?: string
  hint?: ReactNode
  /** Elemento à direita dentro do campo (ex.: botão mostrar senha). */
  trailing?: ReactNode
  wrapperClassName?: string
}

/**
 * Campo de formulário do design system: rótulo, `.input`, e mensagens de
 * erro (✕, accent-700) ou sucesso (✓, verde) — nunca só cor.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, success, hint, trailing, wrapperClassName, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const msgId = `${inputId}-msg`
  const hasMsg = Boolean(error || success || hint)

  return (
    <div className={wrapperClassName}>
      <label htmlFor={inputId} className="mb-[5px] block text-xs text-text/70">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hasMsg ? msgId : undefined}
          className={cn(
            'min-h-9 w-full border bg-surface px-2.5 py-1.5 text-sm text-text caret-accent transition-colors placeholder:text-neutral-600 hover:border-text/45 focus-visible:border-accent focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-60',
            error ? 'border-2 border-accent-700' : 'border-divider',
            !!trailing && 'pr-10',
            className,
          )}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>}
      </div>
      {hasMsg && (
        <div id={msgId} className="mt-1 text-xs font-semibold" aria-live="polite">
          {error ? (
            <span className="text-accent-700">✕ {error}</span>
          ) : success ? (
            <span className="text-success">✓ {success}</span>
          ) : (
            <span className="text-muted font-normal">{hint}</span>
          )}
        </div>
      )}
    </div>
  )
})
