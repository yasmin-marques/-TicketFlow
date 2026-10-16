/** Soma `days` a uma chave YYYY-MM-DD (aritmética em UTC, sem fuso). */
export function addDays(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
