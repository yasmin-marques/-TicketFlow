import type { VenueDetail } from '@/types/event'
import { EventSection } from './EventSection'

function mapsUrl(venue: VenueDetail): string {
  const query = [venue.name, venue.address, venue.city, venue.state].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/** Local do evento: mapa estilizado + endereço. Campos ausentes são omitidos. */
export function EventVenue({ venue }: { venue: VenueDetail }) {
  const cityLine = venue.district ?? `${venue.city} – ${venue.state}`
  return (
    <EventSection title="Local e como chegar">
      <div className="grid gap-6 sm:grid-cols-2">
        <div role="img" aria-label={`Mapa de ${venue.name}`} className="bg-map-grid relative h-[180px]">
          <span aria-hidden className="absolute top-1/2 left-1/2 -m-[9px] size-[18px] bg-accent" />
          <span aria-hidden className="absolute bottom-1.5 left-2 font-mono text-[10px] font-semibold text-neutral-700">
            MAPA
          </span>
        </div>
        <address className="text-sm not-italic">
          <b className="text-[17px]">{venue.name}</b>
          {venue.address && (
            <>
              <br />
              {venue.address}
            </>
          )}
          <br />
          {cityLine}
          {venue.notes && (
            <>
              <br />
              <br />
              <span className="text-muted">{venue.notes}</span>
            </>
          )}
          <br />
          <a href={mapsUrl(venue)} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-700">
            Como chegar →
          </a>
        </address>
      </div>
    </EventSection>
  )
}
