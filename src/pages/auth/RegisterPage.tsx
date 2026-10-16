import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { PasswordField } from '@/components/ui/PasswordField'
import { TextField } from '@/components/ui/TextField'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { useAuth } from '@/features/auth/AuthProvider'
import { safeNext } from '@/features/auth/RequireAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { emailSchema, nameSchema, passwordSchema } from '@/lib/validation'
import { ApiError } from '@/services/api/http'

const schema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string().min(1, 'Confirme a senha'),
    terms: z.boolean().refine((v) => v, 'É preciso aceitar os termos'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não conferem' })
type Values = z.infer<typeof schema>

export function RegisterPage() {
  useDocumentTitle('Criar conta')
  const { register: signUp, status } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { name: '', email: '', password: '', confirm: '', terms: false },
  })

  if (status === 'authenticated') return <Navigate to={next} replace />

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    setFormError(null)
    try {
      await signUp({ name, email, password })
      navigate(next, { replace: true })
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível criar a conta. Tente novamente.')
    }
  })

  return (
    <AuthLayout
      title="Criar conta"
      subtitle="Leva menos de um minuto."
      footer={
        <>
          Já tem conta?{' '}
          <Link to={`/entrar${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <Alert title={formError} />}
        <TextField label="Nome completo" autoComplete="name" error={errors.name?.message} {...register('name')} />
        <TextField label="E-mail" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <PasswordField
          label="Senha"
          autoComplete="new-password"
          hint="Mínimo de 8 caracteres, com letras e números."
          error={errors.password?.message}
          {...register('password')}
        />
        <PasswordField label="Confirmar senha" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm')} />
        <div>
          <Controller
            control={control}
            name="terms"
            render={({ field }) => (
              <Checkbox checked={field.value} onChange={field.onChange}>
                <span className="text-sm">
                  Li e aceito os <Link to="/termos">termos de uso</Link> e a <Link to="/privacidade">política de privacidade</Link>.
                </span>
              </Checkbox>
            )}
          />
          {errors.terms && <div className="mt-1 text-xs font-semibold text-accent-700">✕ {errors.terms.message}</div>}
        </div>
        <Button type="submit" size="lg" block disabled={isSubmitting}>
          {isSubmitting ? 'Criando conta…' : 'Criar conta'}
        </Button>
      </form>
    </AuthLayout>
  )
}
