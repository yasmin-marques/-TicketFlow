import { z } from 'zod'
import {
  birthDateSchema,
  cardExpiryStatus,
  cpfSchema,
  emailSchema,
  isValidCardNumber,
  nameSchema,
  phoneSchema,
} from '@/lib/validation'

export const buyerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  cpf: cpfSchema,
  birthDate: birthDateSchema,
  holders: z.array(z.object({ name: z.string().trim().max(80, 'Máximo de 80 caracteres') })),
})
export type BuyerFormValues = z.infer<typeof buyerSchema>

export const cardSchema = z.object({
  number: z.string().refine(isValidCardNumber, 'Número de cartão inválido'),
  holderName: z.string().trim().min(3, 'Informe o nome impresso no cartão'),
  expiry: z.string().superRefine((v, ctx) => {
    const status = cardExpiryStatus(v)
    if (status === 'invalid') ctx.addIssue({ code: 'custom', message: 'Use o formato MM/AA' })
    if (status === 'expired') ctx.addIssue({ code: 'custom', message: 'Cartão vencido' })
  }),
  cvv: z.string().regex(/^\d{3,4}$/, 'CVV inválido'),
  installments: z.number().int().min(1).max(6),
})

const termsSchema = z.boolean().refine((v) => v, 'Aceite os termos para continuar')

/** Valida o cartão só quando a forma de pagamento escolhida é cartão. */
export const paymentSchemaFor = (method: 'pix' | 'card' | 'boleto') =>
  method === 'card' ? z.object({ terms: termsSchema, card: cardSchema }) : z.object({ terms: termsSchema })

export type PaymentFormValues = {
  terms: boolean
  card?: z.infer<typeof cardSchema>
}
