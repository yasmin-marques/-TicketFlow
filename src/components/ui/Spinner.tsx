import { cn } from '@/lib/cn'

/** Spinner quadrado-circular do estado "Processando" (borda de 4px, topo em accent). */
export function Spinner({ className, label = 'Carregando' }: { className?: string; label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        'size-11 animate-spin rounded-full border-4 border-neutral-300 border-t-accent motion-reduce:animate-none',
        className,
      )}
    />
  )
}
