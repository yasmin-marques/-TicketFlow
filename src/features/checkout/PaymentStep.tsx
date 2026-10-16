import { zodResolver } from '@hookform/resolvers/zod'
import { maskedRegister } from '@/lib/forms'
import { useMemo, useRef, useState } from 'react'
import { Controller, useForm, type Resolver } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Segmented } from '@/components/ui/Segmented'
import { Spinner } from '@/components/ui/Spinner'
import { TextField } from '@/components/ui/TextField'
import { formatPrice } from '@/lib/format'
import type { Slot } from '@/lib/purchase'
import { cardBrand, maskCardNumber, maskExpiry } from '@/lib/validation'
import { ApiError, newIdempotencyKey } from '@/services/api/http'
import { ordersService } from '@/services/api/purchase.service'
import type { CreateOrderInput, Order, PaymentMethod, Reservation } from '@/types/purchase'
import type { CheckoutDraft } from './draft'
import { paymentSchemaFor, type PaymentFormValues } from './schemas'

type Phase = 'idle' | 'processing' | 'approved'

interface PaymentStepProps {
  reservation: Reservation
  slots: Slot[]
  draft: CheckoutDraft
  onBack: () => void
  onPaid: (order: Order) => void
  onExpired: () => void
}

const METHODS = [
  { value: 'pix', label: 'Pix' },
  { value: 'card', label: 'Cartão de crédito' },
  { value: 'boleto', label: 'Boleto' },
] as const

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Etapa 3 — pagamento SIMULADO. Nenhum gateway é chamado e o número do cartão
 * não é guardado. Cartão terminado em 0002 simula recusa; Pix e boleto geram
 * pedido pendente.
 */
export function PaymentStep({ reservation, slots, draft, onBack, onPaid, onExpired }: PaymentStepProps) {
  const [method, setMethod] = useState<PaymentMethod>('card')
  const [phase, setPhase] = useState<Phase>('idle')
  const [notice, setNotice] = useState<{ tone: 'declined' | 'error'; message: string } | null>(null)
  const idemKey = useRef(newIdempotencyKey())

  const maxInstallments = Math.max(1, Math.min(6, Math.floor(reservation.total / 30)))

  const schema = useMemo(() => paymentSchemaFor(method), [method])
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<PaymentFormValues>,
    mode: 'onTouched',
    shouldUnregister: true,
    defaultValues: { terms: false, card: { number: '', holderName: '', expiry: '', cvv: '', installments: 1 } },
  })

  const masked = (name: 'card.number' | 'card.expiry', mask: (v: string) => string) => maskedRegister(register, name, mask)

  const cardNumber = watch('card.number') ?? ''
  const brand = cardBrand(cardNumber)

  const submit = handleSubmit(async (values) => {
    setNotice(null)
    setPhase('processing')
    const input: CreateOrderInput = {
      reservationId: reservation.id,
      buyer: draft.buyer,
      holders: slots.flatMap((s, i) => (draft.holders[i] ? [{ slot: s.slot, name: draft.holders[i]! }] : [])),
      payment: method === 'card' && values.card ? { method, card: values.card } : { method },
    }
    try {
      const order = await ordersService.create(input, idemKey.current)
      if (order.status === 'paid') {
        setPhase('approved')
        await wait(900)
      }
      onPaid(order)
    } catch (err) {
      setPhase('idle')
      if (err instanceof ApiError) {
        if (err.status === 402) {
          idemKey.current = newIdempotencyKey()
          setNotice({ tone: 'declined', message: 'Pagamento recusado pelo banco.' })
          return
        }
        if (err.status === 410 || err.code === 'RESERVATION_EXPIRED') return onExpired()
        if (err.status === 409 && err.code === 'ALREADY_COMPLETED') {
          setNotice({ tone: 'error', message: 'Esta compra já foi concluída. Veja seus pedidos.' })
          return
        }
        if (err.status !== null && err.status < 500) {
          idemKey.current = newIdempotencyKey()
          setNotice({ tone: 'error', message: err.message })
          return
        }
        if (err.status === null) {
          // Falha de rede: mantém a chave — repetir é seguro e não cobra em duplicidade.
          setNotice({ tone: 'error', message: 'Sem conexão. Verifique sua internet e tente novamente — você não será cobrado em duplicidade.' })
          return
        }
      }
      setNotice({ tone: 'error', message: 'Não foi possível processar o pagamento agora. Tente novamente.' })
    }
  })

  const statusPanel =
    phase === 'idle' ? null : (
      <div role="status" aria-live="polite" className="max-w-[700px]">
        <h2 className="mb-6 text-[32px]">Pagamento</h2>
        {phase === 'processing' ? (
          <div className="border-2 border-text p-9">
            <Spinner className="mb-5" label="Processando pagamento" />
            <div className="text-2xl font-extrabold">Confirmando pagamento…</div>
            <p className="text-muted mt-1 text-sm">Não feche esta janela. Seus assentos seguem guardados.</p>
          </div>
        ) : (
          <div className="border-2 border-text p-9">
            <div className="mb-5 grid size-11 place-items-center bg-success text-2xl font-extrabold text-white" aria-hidden>
              ✓
            </div>
            <div className="text-2xl font-extrabold">Pagamento aprovado</div>
            <p className="text-muted mt-1 text-sm">Emitindo seus ingressos… você será levado à confirmação.</p>
            <div className="mt-4 h-1 bg-neutral-300">
              <div className="h-full w-[70%] bg-success" />
            </div>
          </div>
        )}
      </div>
    )

  return (
    <>
      {statusPanel}
      {/* O formulário continua montado (só oculto) para não perder o que foi digitado após uma recusa. */}
      <form onSubmit={submit} noValidate hidden={phase !== 'idle'}>
      <h2 className="mb-1 text-[32px]">Pagamento</h2>

      {notice && (
        <Alert className="my-4 max-w-[700px]" title={notice.message}>
          {notice.tone === 'declined' ? (
            <>
              Nenhum valor foi cobrado e seus assentos continuam reservados. Confira os dados ou escolha outro método.
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={() => setNotice(null)}>
                  Tentar novamente
                </Button>
                <Button variant="secondary" onClick={() => { setMethod('pix'); setNotice(null) }}>
                  Pagar com Pix
                </Button>
              </div>
            </>
          ) : notice.message.includes('já foi concluída') ? (
            <Link to="/pedidos">Ver meus pedidos →</Link>
          ) : null}
        </Alert>
      )}

      <Segmented
        label="Forma de pagamento"
        className="my-5"
        value={method}
        onChange={(m) => {
          setMethod(m)
          setNotice(null)
        }}
        options={METHODS}
      />

      {method === 'card' && (
        <div className="grid max-w-[700px] gap-5 sm:grid-cols-3">
          <TextField
            wrapperClassName="sm:col-span-3"
            label="Número do cartão"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="0000 0000 0000 0000"
            error={errors.card?.number?.message}
            hint={brand !== 'Cartão' ? `Bandeira: ${brand}` : undefined}
            {...masked('card.number', maskCardNumber)}
          />
          <TextField
            wrapperClassName="sm:col-span-3"
            label="Nome impresso"
            autoComplete="cc-name"
            style={{ textTransform: 'uppercase' }}
            error={errors.card?.holderName?.message}
            {...register('card.holderName')}
          />
          <TextField
            label="Validade"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/AA"
            error={errors.card?.expiry?.message}
            {...masked('card.expiry', maskExpiry)}
          />
          <TextField
            label="CVV"
            inputMode="numeric"
            autoComplete="cc-csc"
            maxLength={4}
            placeholder="•••"
            error={errors.card?.cvv?.message}
            {...register('card.cvv')}
          />
          <div>
            <label htmlFor="installments" className="mb-[5px] block text-xs text-text/70">
              Parcelas
            </label>
            <select
              id="installments"
              className="min-h-9 w-full border border-divider bg-surface px-2.5 py-1.5 text-sm hover:border-text/45"
              {...register('card.installments', { valueAsNumber: true })}
            >
              {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}× {formatPrice(reservation.total / n)}
                  {n > 1 ? ' sem juros' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {method === 'pix' && (
        <div className="max-w-[700px] border-2 border-dashed border-neutral-500 p-4 text-sm">
          Na próxima tela você verá o QR Code e o código “copia e cola” do Pix. O pedido fica pendente por 30 minutos e os
          ingressos são emitidos quando o pagamento for confirmado.
        </div>
      )}
      {method === 'boleto' && (
        <div className="max-w-[700px] border-2 border-dashed border-neutral-500 p-4 text-sm">
          O boleto vence em 3 dias. Os ingressos são emitidos após a compensação. Seus assentos ficam guardados até o
          vencimento.
        </div>
      )}

      <div className="mt-6 max-w-[700px]">
        <Controller
          control={control}
          name="terms"
          render={({ field }) => (
            <Checkbox checked={field.value} onChange={field.onChange}>
              <span className="text-sm">
                Li e aceito os <Link to="/termos">termos de compra</Link> e a política de cancelamento.
              </span>
            </Checkbox>
          )}
        />
        {errors.terms && <div className="mt-1 text-xs font-semibold text-accent-700">✕ {errors.terms.message}</div>}
      </div>

      <div className="mt-6 flex gap-2.5">
        <Button variant="secondary" onClick={onBack}>
          ← Voltar
        </Button>
        <Button type="submit" size="lg">
          {method === 'card' ? `Pagar ${formatPrice(reservation.total)}` : method === 'pix' ? 'Gerar Pix' : 'Gerar boleto'}
        </Button>
      </div>
      <p className="text-muted mt-3 max-w-[700px] text-xs">
        Pagamento simulado neste ambiente. Seus dados de cartão não são armazenados. Para testar: o cartão{' '}
        <b>4000 0000 0000 0002</b> é recusado; <b>4242 4242 4242 4242</b> é aprovado; Pix e boleto geram pedido pendente.
      </p>
      </form>
    </>
  )
}
