import { formatDateMedium, formatDateWithTime, formatTime } from '@/lib/format'
import type { EventDetail } from '@/types/event'

function ageLabel(age: number | undefined): string {
  if (age === undefined) return 'Não informada'
  return age === 0 ? 'Livre' : `${age} anos`
}

function timeLabel(event: EventDetail): string {
  const start = formatTime(event.startsAt)
  return event.endsAt ? `${start} – ${formatTime(event.endsAt)}` : start
}

/** Data, horário e classificação: faixa de 3 colunas no desktop, lista no mobile. */
export function EventFacts({ event }: { event: EventDetail }) {
  const place = `${event.venue.name}, ${event.venue.city}`
  return (
    <>
      <dl className="m-0 my-7 hidden grid-cols-3 border-y-2 border-text lg:grid">
        <div className="py-3.5">
          <dt className="text-muted text-xs">Data</dt>
          <dd className="m-0 font-extrabold">{formatDateMedium(event.startsAt)}</dd>
        </div>
        <div className="border-l border-neutral-400 py-3.5 pl-5">
          <dt className="text-muted text-xs">Horário</dt>
          <dd className="tabular m-0 font-extrabold">{timeLabel(event)}</dd>
        </div>
        <div className="border-l border-neutral-400 py-3.5 pl-5">
          <dt className="text-muted text-xs">Classificação</dt>
          <dd className="m-0 font-extrabold">{ageLabel(event.ageRating)}</dd>
        </div>
      </dl>

      <dl className="m-0 mt-3.5 grid grid-cols-[70px_1fr] border-t-2 border-text text-sm lg:hidden">
        <dt className="text-muted py-[9px]">Data</dt>
        <dd className="m-0 py-[9px] font-extrabold">{formatDateWithTime(event.startsAt)}</dd>
        <dt className="text-muted border-t border-neutral-400 py-[9px]">Local</dt>
        <dd className="m-0 border-t border-neutral-400 py-[9px] font-extrabold">{place}</dd>
        <dt className="text-muted border-t border-neutral-400 py-[9px]">Idade</dt>
        <dd className="m-0 border-t border-neutral-400 py-[9px] font-extrabold">{ageLabel(event.ageRating)}</dd>
      </dl>
    </>
  )
}
