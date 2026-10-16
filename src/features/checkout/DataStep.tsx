import { zodResolver } from '@hookform/resolvers/zod'
import { maskedRegister } from '@/lib/forms'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { isValidCpf, maskCpf, maskDate, maskPhone } from '@/lib/validation'
import type { Slot } from '@/lib/purchase'
import { buyerSchema, type BuyerFormValues } from './schemas'
import type { CheckoutDraft } from './draft'

interface DataStepProps {
  slots: Slot[]
  initial: CheckoutDraft['buyer']
  initialHolders: string[]
  onBack: () => void
  onSubmit: (draft: CheckoutDraft) => void
}

/** Etapa 2 — dados do comprador e titulares, com validação inline no blur. */
export function DataStep({ slots, initial, initialHolders, onBack, onSubmit }: DataStepProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, touchedFields },
  } = useForm<BuyerFormValues>({
    resolver: zodResolver(buyerSchema),
    mode: 'onTouched',
    defaultValues: {
      ...initial,
      holders: slots.map((_, i) => ({ name: initialHolders[i] ?? '' })),
    },
  })

  /** Aplica a máscara antes do RHF ler o valor. */
  const masked = (name: 'phone' | 'cpf' | 'birthDate', mask: (v: string) => string) => maskedRegister(register, name, mask)

  const cpfValue = watch('cpf')

  const submit = handleSubmit((values) => {
    const { holders, ...buyer } = values
    onSubmit({ buyer, holders: holders.map((h) => h.name.trim()) })
  })

  return (
    <form onSubmit={submit} noValidate>
      <h2 className="mb-1 text-[32px]">Seus dados</h2>
      <p className="text-muted text-sm">Enviamos os ingressos para este e-mail e eles ficam na sua conta.</p>

      <div className="mt-5 grid max-w-[700px] gap-5 sm:grid-cols-2">
        <TextField wrapperClassName="sm:col-span-2" label="Nome completo" autoComplete="name" error={errors.name?.message} {...register('name')} />
        <TextField label="E-mail" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <TextField
          label="Celular"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 98877-6655"
          error={errors.phone?.message}
          {...masked('phone', maskPhone)}
        />
        <TextField
          label="CPF"
          inputMode="numeric"
          placeholder="000.000.000-00"
          error={errors.cpf?.message}
          success={touchedFields.cpf && !errors.cpf && isValidCpf(cpfValue) ? 'CPF válido' : undefined}
          {...masked('cpf', maskCpf)}
        />
        <TextField
          label="Data de nascimento"
          inputMode="numeric"
          placeholder="dd/mm/aaaa"
          autoComplete="bday"
          error={errors.birthDate?.message}
          {...masked('birthDate', maskDate)}
        />
      </div>

      <h3 className="mt-8 mb-2 text-xl">Titulares dos ingressos</h3>
      <p className="text-muted mb-3 text-[13px]">Deixe em branco para usar o seu nome.</p>
      <ul className="m-0 max-w-[700px] list-none border-t-2 border-text p-0">
        {slots.map((slot, i) => (
          <li
            key={slot.slot}
            className={`grid grid-cols-[84px_1fr] items-start gap-4 py-3 ${i === slots.length - 1 ? 'border-b-2 border-divider' : 'border-b border-neutral-400'}`}
          >
            <div className="pt-1">
              <b className="text-lg">{slot.seatId ?? `#${i + 1}`}</b>
              <div className="text-muted text-[11px]">{slot.typeName}</div>
            </div>
            <TextField
              label={`Titular do ingresso ${slot.seatId ?? i + 1}`}
              className="mt-0"
              placeholder={i === 0 ? 'Nome do titular (padrão: você)' : 'Nome do acompanhante (opcional)'}
              error={errors.holders?.[i]?.name?.message}
              {...register(`holders.${i}.name`)}
            />
          </li>
        ))}
      </ul>

      <div className="mt-8 flex gap-2.5">
        <Button variant="secondary" onClick={onBack}>
          ← Voltar
        </Button>
        <Button type="submit" size="lg">
          Continuar para pagamento →
        </Button>
      </div>
    </form>
  )
}
