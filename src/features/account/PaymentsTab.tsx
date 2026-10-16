import { zodResolver } from '@hookform/resolvers/zod'
import { maskedRegister } from '@/lib/forms'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { LoadError } from '@/components/domain/LoadError'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/Toast'
import { maskCardNumber, maskExpiry } from '@/lib/validation'
import { accountService } from '@/services/api/account.service'
import { cardSchema } from '../checkout/schemas'

const addSchema = cardSchema.pick({ number: true, holderName: true, expiry: true })

/** Cartões salvos. Só marca, final e validade — nunca o número completo nem o CVV. */
export function PaymentsTab() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const cards = useQuery({ queryKey: ['cards'], queryFn: ({ signal }) => accountService.cards(signal) })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(addSchema), mode: 'onTouched', defaultValues: { number: '', holderName: '', expiry: '' } })

  const masked = (name: 'number' | 'expiry', mask: (v: string) => string) => maskedRegister(register, name, mask)

  const add = useMutation({
    mutationFn: accountService.addCard,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cards'] })
      toast.show({ message: 'Cartão adicionado' })
      reset()
      setAdding(false)
    },
    onError: () => toast.show({ message: 'Não foi possível adicionar o cartão.' }),
  })

  const remove = useMutation({
    mutationFn: accountService.removeCard,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cards'] })
      toast.show({ message: 'Cartão removido' })
    },
    onError: () => toast.show({ message: 'Não foi possível remover o cartão.' }),
  })

  if (cards.error) return <LoadError title="Não foi possível carregar seus cartões." error={cards.error} onRetry={() => cards.refetch()} />
  if (cards.isPending) return <Skeleton className="h-24" />

  return (
    <div>
      {cards.data.length === 0 ? (
        <EmptyState title="Nenhum cartão salvo" description="Adicione um cartão para pagar mais rápido nas próximas compras." />
      ) : (
        <ul className="m-0 list-none border-t-2 border-text p-0">
          {cards.data.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 border-b border-neutral-400 py-3.5">
              <div>
                <div className="font-extrabold">
                  {c.brand} •• {c.last4}
                </div>
                <div className="text-muted text-sm">
                  {c.holderName} · vence {c.expiry}
                </div>
              </div>
              <Button variant="secondary" disabled={remove.isPending} onClick={() => remove.mutate(c.id)} aria-label={`Remover cartão final ${c.last4}`}>
                Remover
              </Button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form noValidate onSubmit={handleSubmit((v) => add.mutate(v))} className="mt-6 grid gap-5 border-2 border-text p-5 sm:grid-cols-2">
          <TextField wrapperClassName="sm:col-span-2" label="Número do cartão" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" error={errors.number?.message} {...masked('number', maskCardNumber)} />
          <TextField label="Nome impresso" autoComplete="cc-name" error={errors.holderName?.message} {...register('holderName')} />
          <TextField label="Validade" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" error={errors.expiry?.message} {...masked('expiry', maskExpiry)} />
          <p className="text-muted text-xs sm:col-span-2">Guardamos apenas a bandeira, o final e a validade (simulado). O CVV nunca é salvo.</p>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? 'Salvando…' : 'Salvar cartão'}
            </Button>
            <Button variant="secondary" onClick={() => { reset(); setAdding(false) }}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" className="mt-5" onClick={() => setAdding(true)}>
          Adicionar cartão
        </Button>
      )}
    </div>
  )
}
