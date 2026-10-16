import { z } from 'zod'

export const onlyDigits = (v: string) => v.replace(/\D/g, '')

/* ── Máscaras ────────────────────────────────────────────────────────── */

export function maskCpf(v: string): string {
  const d = onlyDigits(v).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

export function maskPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function maskDate(v: string): string {
  const d = onlyDigits(v).slice(0, 8)
  return d.replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3')
}

export function maskCardNumber(v: string): string {
  return onlyDigits(v)
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ')
}

export function maskExpiry(v: string): string {
  const d = onlyDigits(v).slice(0, 4)
  return d.replace(/^(\d{2})(\d)/, '$1/$2')
}

/* ── Validadores ─────────────────────────────────────────────────────── */

export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const calc = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const mod = (sum * 10) % 11
    return mod === 10 ? 0 : mod
  }
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
}

export function isValidPhone(value: string): boolean {
  const d = onlyDigits(value)
  return (d.length === 10 || d.length === 11) && Number(d.slice(0, 2)) >= 11
}

/** dd/mm/aaaa válida, no passado e com idade plausível. */
export function isValidBirthDate(value: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!m) return false
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return false
  const now = new Date()
  return date < now && y >= now.getFullYear() - 120
}

export function isValidCardNumber(value: string): boolean {
  const d = onlyDigits(value)
  if (d.length < 13 || d.length > 19) return false
  let sum = 0
  let alt = false
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i])
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

/** MM/AA existente e não vencida (vale até o fim do mês). */
export function cardExpiryStatus(value: string): 'invalid' | 'expired' | 'ok' {
  const m = /^(\d{2})\/(\d{2})$/.exec(value)
  if (!m) return 'invalid'
  const month = Number(m[1])
  const year = 2000 + Number(m[2])
  if (month < 1 || month > 12) return 'invalid'
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)
  return endOfMonth < new Date() ? 'expired' : 'ok'
}

export function cardBrand(number: string): 'Visa' | 'Mastercard' | 'Elo' | 'Amex' | 'Cartão' {
  const d = onlyDigits(number)
  if (/^4/.test(d)) return 'Visa'
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard'
  if (/^3[47]/.test(d)) return 'Amex'
  if (/^(636368|438935|504175|451416|636297|5067|4576|4011)/.test(d)) return 'Elo'
  return 'Cartão'
}

/* ── Esquemas reutilizáveis ──────────────────────────────────────────── */

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Informe o e-mail')
  .email('E-mail inválido')

export const passwordSchema = z
  .string()
  .min(8, 'Use ao menos 8 caracteres')
  .regex(/[A-Za-z]/, 'Inclua ao menos uma letra')
  .regex(/\d/, 'Inclua ao menos um número')

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Informe o nome')
  .refine((v) => v.split(/\s+/).length >= 2, 'Informe nome e sobrenome')

export const phoneSchema = z.string().refine(isValidPhone, 'Informe o número completo com DDD')
export const cpfSchema = z.string().refine(isValidCpf, 'CPF inválido')
export const birthDateSchema = z.string().refine(isValidBirthDate, 'Data inválida (dd/mm/aaaa)')
