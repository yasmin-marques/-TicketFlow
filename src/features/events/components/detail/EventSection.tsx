import type { ReactNode } from 'react'
import { Collapsible } from '@/components/ui/Collapsible'
import { useIsDesktop } from '@/hooks/useMediaQuery'

interface EventSectionProps {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}

/**
 * Seção da página do evento. No desktop é um bloco com título H3; no mobile
 * vira acordeão (▾), como no protótipo "Mobile · Evento".
 */
export function EventSection({ title, children, defaultOpen = false }: EventSectionProps) {
  const desktop = useIsDesktop()

  if (desktop) {
    return (
      <section className="mt-8">
        <h3>{title}</h3>
        {children}
      </section>
    )
  }

  return (
    <Collapsible
      title={title}
      defaultOpen={defaultOpen}
      titleClassName="border-t border-neutral-400 py-3 text-[17px] font-extrabold"
    >
      <div className="pb-4">{children}</div>
    </Collapsible>
  )
}
