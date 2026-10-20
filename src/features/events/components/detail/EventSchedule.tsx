import type { ScheduleItem } from '@/types/event'
import { EventSection } from './EventSection'

/** Programação em linhas de hora · atração · palco. Não renderiza se vazia. */
export function EventSchedule({ items }: { items: ScheduleItem[] }) {
  if (items.length === 0) return null
  return (
    <EventSection title="Programação">
      <ol className="surface m-0 list-none px-4 py-1 lg:px-5">
        {items.map((item, i) => (
          <li
            key={`${item.time}-${item.title}`}
            className={`grid grid-cols-[64px_1fr] gap-x-3 py-3 sm:grid-cols-[90px_1fr_140px] ${
              i === items.length - 1 ? '' : 'border-b border-line'
            }`}
          >
            <b className="tabular text-accent-700">{item.time}</b>
            <span>{item.title}</span>
            <span className="text-muted col-start-2 text-sm sm:col-start-auto sm:text-base">
              {item.location ?? '—'}
            </span>
          </li>
        ))}
      </ol>
    </EventSection>
  )
}
