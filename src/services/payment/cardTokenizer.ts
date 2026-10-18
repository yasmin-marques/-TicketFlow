import type { CardInput, TokenizedCard } from '@/types/purchase'
import { USE_MOCKS } from '../api/http'

/**
 * Troca os dados do cartão por um token antes de enviá-los ao backend.
 *
 * - Mocks: devolve os dados como estão (o servidor simulado só guarda o final).
 * - API real: o backend recusa número/CVV (`422 CARD_DATA_NOT_ALLOWED`). Enquanto não houver o SDK de um
 *   gateway integrado, gera o token de TESTE do provedor sandbox do backend (`tok_<4 últimos dígitos>`:
 *   `tok_4242` aprova, `tok_0002` recusa). Isto NÃO é tokenização real e só funciona com o backend nos
 *   perfis dev/test. Em produção, substitua pelo SDK do gateway (os dados do cartão vão direto para ele).
 */
export async function toPaymentCard(card: CardInput): Promise<CardInput | TokenizedCard> {
  if (USE_MOCKS) return card
  const digits = card.number.replace(/\D/g, '')
  return { token: `tok_${digits.slice(-4)}`, installments: card.installments }
}
