import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { formatCountdown } from '@/lib/purchase'
import { WARNING_THRESHOLD_MS } from './ReservationProvider'

/** Milissegundos restantes até `expiresAt` (atualiza a cada 250 ms, sem animação de pulso). */
export function useRemainingMs(expiresAt: string | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [expiresAt])
  return expiresAt ? Math.max(0, new Date(expiresAt).getTime() - now) : 0
}

interface CountdownProps {
  expiresAt: string
  className?: string
  /** Prefixo do protótipo: "⏱". */
  icon?: boolean
}

/** mm:ss tabular. Anuncia só o rótulo, nunca cada segundo, para leitores de tela. */
export function Countdown({ expiresAt, className, icon }: CountdownProps) {
  const remaining = useRemainingMs(expiresAt)
  return (
    <span role="timer" aria-label="Tempo restante da reserva" className={cn('tabular font-extrabold', className)}>
      {icon && <span aria-hidden>⏱ </span>}
      {formatCountdown(remaining)}
    </span>
  )
}

/** Barra de progresso do prazo (largura = tempo restante / duração total). */
export function CountdownBar({ createdAt, expiresAt }: { createdAt: string; expiresAt: string }) {
  const remaining = useRemainingMs(expiresAt)
  const total = new Date(expiresAt).getTime() - new Date(createdAt).getTime()
  const pct = total > 0 ? Math.min(100, (remaining / total) * 100) : 0
  return (
    <div aria-hidden className="my-2.5 h-1 bg-neutral-300">
      <div className={cn('h-full transition-[width] duration-300', remaining <= WARNING_THRESHOLD_MS ? 'bg-warning' : 'bg-text')} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Aviso discreto aos 02:00 do fim (bloco "Erro · feedback" do protótipo). */
export function useReservationWarning(expiresAt: string | undefined): boolean {
  const remaining = useRemainingMs(expiresAt)
  return !!expiresAt && remaining > 0 && remaining <= WARNING_THRESHOLD_MS
}
