import { useState } from 'react'
import { AttendeesPanel } from '@/features/org/AttendeesPanel'
import { OrgPageHeader } from '@/features/org/components/common'
import { useOrgEvents } from '@/features/org/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

/** /org/participantes — participantes por evento e status de check-in. */
export function ParticipantsPage() {
  useDocumentTitle('Participantes · Organizador')
  const events = useOrgEvents('published', '')
  const [eventId, setEventId] = useState<string | null>(null)
  // Padrão: o primeiro evento publicado, como no protótipo.
  const effective = eventId ?? events.data?.items[0]?.id ?? ''
  return (
    <>
      <OrgPageHeader title="Participantes" subtitle="Consulte quem comprou e quem já entrou" />
      <AttendeesPanel eventId={effective} onEventChange={setEventId} />
    </>
  )
}
