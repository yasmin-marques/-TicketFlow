/**
 * Datas relativas a "hoje" (fuso de São Paulo), para que o catálogo mockado
 * nunca fique vencido. O Brasil não adota horário de verão desde 2019 (-03:00).
 */
const pad = (n: number) => String(n).padStart(2, '0')

function todayInSaoPaulo(): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return { y: get('year'), m: get('month'), d: get('day') }
}

/** ISO 8601 para daqui a `days` dias às `hhmm` ("20:00"). */
export function inDays(days: number, hhmm: string): string {
  const { y, m, d } = todayInSaoPaulo()
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${hhmm}:00-03:00`
}

/** Próximo sábado ('sat') ou domingo ('sun'), contando hoje se já for o dia. */
export function nextWeekend(day: 'sat' | 'sun', hhmm: string): string {
  const { y, m, d } = todayInSaoPaulo()
  const today = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const target = day === 'sat' ? 6 : 0
  return inDays((target - today + 7) % 7, hhmm)
}

/** Soma `hours` horas a um ISO e devolve ISO no mesmo formato (-03:00). */
export function addHours(iso: string, hours: number): string {
  const date = new Date(new Date(iso).getTime() + hours * 3600_000 - 3 * 3600_000)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:00-03:00`
}
