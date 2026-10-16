import { cn } from '@/lib/cn'

/** Bloco de carregamento (neutral-300 do protótipo). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton', className)} />
}
