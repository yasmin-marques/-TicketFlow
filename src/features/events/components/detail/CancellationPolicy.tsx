import { Collapsible } from '@/components/ui/Collapsible'
import type { PolicyItem } from '@/types/event'
import { EventSection } from './EventSection'

/** Política de cancelamento em acordeão "+". Não renderiza se não informada. */
export function CancellationPolicy({ items }: { items: PolicyItem[] }) {
  if (items.length === 0) return null
  return (
    <EventSection title="Política de cancelamento">
      <div className="surface px-4 lg:px-5">
        {items.map((item, i) => (
          <Collapsible
            key={item.title}
            title={item.title}
            indicator="plus"
            titleClassName="py-3 text-left font-semibold"
            className={i === items.length - 1 ? undefined : 'border-b border-line'}
          >
            <p className="text-muted pb-3 text-sm">{item.body}</p>
          </Collapsible>
        ))}
      </div>
    </EventSection>
  )
}
