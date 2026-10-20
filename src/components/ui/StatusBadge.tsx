import { cn } from '@/lib/cn'

/** Um único mapa status → cor (bloco "Reutilizados entre páginas" do protótipo). */
const TONES = {
  success: 'bg-[#d3e8dc] text-[#14532d]',
  warning: 'bg-[#f3e2b8] text-[#5f4108]',
  danger: 'bg-[#ffe0d9] text-[#7c1405]',
  neutral: 'bg-[#d7d3d3] text-neutral-900',
  muted: 'bg-neutral-200 text-neutral-700',
} as const

export type StatusTone = keyof typeof TONES

interface StatusBadgeProps {
  label: string
  tone: StatusTone
  className?: string
}

export function StatusBadge({ label, tone, className }: StatusBadgeProps) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-chip px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current before:opacity-70 before:content-[""]', TONES[tone], className)}>{label}</span>
}

export const ORDER_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  paid: { label: 'Pago', tone: 'success' },
  pending: { label: 'Pendente', tone: 'warning' },
  refunded: { label: 'Reembolsado', tone: 'neutral' },
  expired: { label: 'Expirado', tone: 'muted' },
}

/* Painel do organizador: um único mapa status → cor para eventos, pedidos, lotes e check-in. */
export const EVENT_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  published: { label: 'Publicado', tone: 'success' },
  ended: { label: 'Encerrado', tone: 'muted' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
}

export const ORG_ORDER_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  paid: { label: 'Pago', tone: 'success' },
  pending: { label: 'Pendente', tone: 'warning' },
  declined: { label: 'Recusado', tone: 'danger' },
  refunded: { label: 'Reembolsado', tone: 'neutral' },
}

export const LOT_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  published: { label: 'Publicado', tone: 'success' },
  'sold-out': { label: 'Esgotado', tone: 'warning' },
  ended: { label: 'Encerrado', tone: 'muted' },
}

export const ATTENDEE_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  'checked-in': { label: 'Check-in feito', tone: 'success' },
  waiting: { label: 'Aguardando', tone: 'warning' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
}

export const TICKET_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  valid: { label: 'Próximo', tone: 'success' },
  used: { label: 'Utilizado', tone: 'muted' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
}
