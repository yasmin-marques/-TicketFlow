import { buildQr } from '@/components/domain/QrCode'
import { formatDateWithTime } from '@/lib/format'
import type { Ticket } from '@/types/purchase'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Monta o ingresso como imagem SVG (QR + dados), para salvar ou imprimir sem internet. */
export function ticketToSvg(ticket: Ticket): string {
  const { count, path } = buildQr(ticket.qrPayload)
  const view = count + 4
  const scale = 300 / view
  const rows: Array<[string, string]> = [
    ['TITULAR', ticket.holderName],
    ['DATA', formatDateWithTime(ticket.eventStartsAt)],
    [ticket.seatId ? 'SETOR' : 'TIPO', ticket.sectorName ?? ticket.typeName],
    ['ASSENTO', ticket.seatId ?? '—'],
  ]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="640" viewBox="0 0 400 640" font-family="Archivo, Arial, sans-serif">
<rect width="400" height="640" fill="#f3f2f2"/>
<rect x="1" y="1" width="398" height="638" fill="none" stroke="#201e1d" stroke-width="2"/>
<rect x="20" y="20" width="14" height="14" fill="#ec3013"/>
<text x="42" y="32" font-size="18" font-weight="800" fill="#201e1d">ticketflow</text>
<text x="20" y="72" font-size="12" font-weight="600" fill="#ae1800" letter-spacing="1.5">INGRESSO ${ticket.status === 'valid' ? 'VÁLIDO' : esc(ticket.status.toUpperCase())}</text>
<text x="20" y="104" font-size="26" font-weight="800" fill="#201e1d">${esc(ticket.eventTitle)}</text>
<rect x="38" y="126" width="324" height="324" fill="#ffffff" stroke="#201e1d" stroke-width="2"/>
<g transform="translate(50 138) scale(${scale})"><g transform="translate(2 2)"><path d="${path}" fill="#201e1d" shape-rendering="crispEdges"/></g></g>
<text x="200" y="478" font-size="14" font-family="monospace" font-weight="600" text-anchor="middle" fill="#201e1d" letter-spacing="2">${esc(ticket.code)}</text>
<line x1="20" y1="496" x2="380" y2="496" stroke="#201e1d" stroke-width="2"/>
${rows
  .map(
    ([k, v], i) =>
      `<text x="${20 + (i % 2) * 190}" y="${524 + Math.floor(i / 2) * 56}" font-size="10" fill="#7d7979">${k}</text><text x="${20 + (i % 2) * 190}" y="${544 + Math.floor(i / 2) * 56}" font-size="15" font-weight="800" fill="#201e1d">${esc(v)}</text>`,
  )
  .join('\n')}
</svg>`
}

export function downloadTicket(ticket: Ticket): void {
  const url = URL.createObjectURL(new Blob([ticketToSvg(ticket)], { type: 'image/svg+xml' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `ingresso-${ticket.code}.svg`
  a.click()
  URL.revokeObjectURL(url)
}
