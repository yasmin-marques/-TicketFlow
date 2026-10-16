const TZ = 'America/Sao_Paulo'

const MONTHS_SHORT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

interface DateParts {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  weekday: string
}

const partsFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
})

function getParts(iso: string): DateParts {
  const out: Record<string, string> = {}
  for (const p of partsFormatter.formatToParts(new Date(iso))) out[p.type] = p.value
  return {
    year: out.year ?? '',
    month: out.month ?? '01',
    day: out.day ?? '',
    hour: out.hour ?? '',
    minute: out.minute ?? '',
    weekday: (out.weekday ?? '').replace('.', ''),
  }
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Preço em reais; omite centavos quando inteiro. "R$ 80" · "R$ 134,40". */
export function formatPrice(value: number): string {
  const hasCents = Math.round(value * 100) % 100 !== 0
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })
}

export function formatDistance(km: number): string {
  return `${km.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
}

/** Chave de dia no fuso de São Paulo: YYYY-MM-DD. */
export function toDateKey(iso: string): string {
  const p = getParts(iso)
  return `${p.year}-${p.month}-${p.day}`
}

/** "24" */
export function formatDay(iso: string): string {
  return getParts(iso).day
}

/** "OUT" */
export function formatMonthShort(iso: string): string {
  return MONTHS_SHORT[Number(getParts(iso).month) - 1] ?? ''
}

/** "20:00" */
export function formatTime(iso: string): string {
  const p = getParts(iso)
  return `${p.hour}:${p.minute}`
}

/** "24 OUT · 20:00" */
export function formatDateShort(iso: string): string {
  return `${formatDay(iso)} ${formatMonthShort(iso)} · ${formatTime(iso)}`
}

/** "Sáb, 24 out 2026" */
export function formatDateMedium(iso: string): string {
  const p = getParts(iso)
  return `${capitalize(p.weekday)}, ${p.day} ${(MONTHS_SHORT[Number(p.month) - 1] ?? '').toLowerCase()} ${p.year}`
}

/** "Sáb, 24 out · 20:00" */
export function formatDateWithTime(iso: string): string {
  const p = getParts(iso)
  return `${capitalize(p.weekday)}, ${p.day} ${(MONTHS_SHORT[Number(p.month) - 1] ?? '').toLowerCase()} · ${p.hour}:${p.minute}`
}

const longMonth = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, month: 'long' })
const longWeekday = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long' })

/** "Sábado, 24 de outubro" */
export function formatDateLong(iso: string): string {
  const d = new Date(iso)
  return `${capitalize(longWeekday.format(d))}, ${getParts(iso).day} de ${longMonth.format(d)}`
}

/** "Sáb, 24 de outubro · 20:00" */
export function formatDateLongTime(iso: string): string {
  const p = getParts(iso)
  return `${capitalize(p.weekday)}, ${p.day} de ${longMonth.format(new Date(iso))} · ${p.hour}:${p.minute}`
}

/** "24 out" a partir de YYYY-MM-DD (para o campo de data da busca). */
export function formatDateKeyShort(key: string): string {
  const [, m, d] = key.split('-')
  return `${d} ${(MONTHS_SHORT[Number(m) - 1] ?? '').toLowerCase()}`
}

/** "24 – 31 out" · "24 out – 02 nov" · "A partir de 24 out" · "Até 31 out" */
export function formatDateRange(from: string, to: string): string {
  if (from && to) {
    const [, fm, fd] = from.split('-')
    const [, tm, td] = to.split('-')
    if (fm === tm) return `${fd} – ${td} ${(MONTHS_SHORT[Number(tm) - 1] ?? '').toLowerCase()}`
    return `${formatDateKeyShort(from)} – ${formatDateKeyShort(to)}`
  }
  if (from) return `A partir de ${formatDateKeyShort(from)}`
  if (to) return `Até ${formatDateKeyShort(to)}`
  return ''
}

export function pluralize(n: number, one: string, many: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`
}
