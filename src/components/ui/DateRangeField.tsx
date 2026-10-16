import { CalendarDays } from 'lucide-react'
import { formatDateRange } from '@/lib/format'
import { Button } from './Button'
import { Popover } from './Popover'

interface DateRangeFieldProps {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
  label?: string
}

/** Botão "1–15 out ▾" com painel de duas datas (De/Até). */
export function DateRangeField({ from, to, onChange, label = 'Período' }: DateRangeFieldProps) {
  const text = formatDateRange(from, to)
  const input = 'mt-1 block w-full border border-divider bg-surface px-2.5 py-1.5 text-sm text-text'
  return (
    <Popover
      panelClassName="w-72"
      renderTrigger={(props) => (
        <button type="button" {...props} aria-label={`${label}: ${text || 'qualquer data'}`} className="inline-flex items-center gap-2 border border-divider px-3 py-1.5 text-sm hover:border-text/45">
          <CalendarDays size={14} aria-hidden />
          {text || <span className="text-muted">Qualquer data</span>}
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-3">
          <label className="text-muted text-xs">
            De
            <input type="date" className={input} value={from} max={to || undefined} onChange={(e) => onChange({ from: e.target.value, to })} />
          </label>
          <label className="text-muted text-xs">
            Até
            <input type="date" className={input} value={to} min={from || undefined} onChange={(e) => onChange({ from, to: e.target.value })} />
          </label>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => onChange({ from: '', to: '' })}>
              Limpar
            </Button>
            <Button onClick={close}>Aplicar</Button>
          </div>
        </div>
      )}
    </Popover>
  )
}
