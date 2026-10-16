import { zodResolver } from '@hookform/resolvers/zod'
import { maskedRegister } from '@/lib/forms'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/Toast'
import { isValidBirthDate, isValidCpf, isValidPhone, maskCpf, maskDate, maskPhone, nameSchema } from '@/lib/validation'
import { accountService } from '@/services/api/account.service'
import { ApiError } from '@/services/api/http'
import type { UserProfile } from '@/types/auth'

/** Campos opcionais no perfil: vazio é aceito, preenchido precisa ser válido. */
const optional = (ok: (v: string) => boolean, message: string) =>
  z.string().refine((v) => v === '' || ok(v), message)

const schema = z.object({
  name: nameSchema,
  phone: optional(isValidPhone, 'Informe o número completo com DDD'),
  cpf: optional(isValidCpf, 'CPF inválido'),
  birthDate: optional(isValidBirthDate, 'Data inválida (dd/mm/aaaa)'),
})
type Values = z.infer<typeof schema>

export function ProfileTab({ profile }: { profile: UserProfile }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { name: profile.name, phone: profile.phone, cpf: profile.cpf, birthDate: profile.birthDate },
  })

  const masked = (name: 'phone' | 'cpf' | 'birthDate', mask: (v: string) => string) => maskedRegister(register, name, mask)

  const save = useMutation({
    mutationFn: (values: Values) => accountService.update(values),
    onSuccess: (updated) => {
      queryClient.setQueryData(['me'], updated)
      reset({ name: updated.name, phone: updated.phone, cpf: updated.cpf, birthDate: updated.birthDate })
      toast.show({ message: 'Perfil atualizado' })
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.'),
  })

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => {
        setFormError(null)
        save.mutate(values)
      })}
      className="grid gap-5 sm:grid-cols-2"
    >
      {formError && <Alert className="sm:col-span-2" title={formError} />}
      <TextField wrapperClassName="sm:col-span-2" label="Nome completo" autoComplete="name" error={errors.name?.message} {...register('name')} />
      <TextField wrapperClassName="sm:col-span-2" label="E-mail" value={profile.email} disabled readOnly hint="O e-mail é o seu login e não pode ser alterado aqui." />
      <TextField label="Celular" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 98877-6655" error={errors.phone?.message} {...masked('phone', maskPhone)} />
      <TextField label="CPF" inputMode="numeric" placeholder="000.000.000-00" error={errors.cpf?.message} {...masked('cpf', maskCpf)} />
      <TextField label="Data de nascimento" inputMode="numeric" placeholder="dd/mm/aaaa" autoComplete="bday" error={errors.birthDate?.message} {...masked('birthDate', maskDate)} />
      <div className="flex items-end gap-2 sm:col-span-2">
        <Button type="submit" size="lg" disabled={!isDirty || save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar alterações'}
        </Button>
        {isDirty && (
          <Button variant="secondary" size="lg" onClick={() => reset()}>
            Descartar
          </Button>
        )}
      </div>
    </form>
  )
}
