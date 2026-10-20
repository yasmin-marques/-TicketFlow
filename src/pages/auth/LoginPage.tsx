import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { PasswordField } from '@/components/ui/PasswordField'
import { TextField } from '@/components/ui/TextField'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { useAuth } from '@/features/auth/AuthProvider'
import { safeNext } from '@/features/auth/RequireAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { emailSchema } from '@/lib/validation'
import { DEMO_EMAIL, DEMO_PASSWORD, ORGANIZER_EMAIL } from '@/mocks/db'
import { ApiError, USE_MOCKS } from '@/services/api/http'

const schema = z.object({ email: emailSchema, password: z.string().min(1, 'Informe a senha') })
type Values = z.infer<typeof schema>

export function LoginPage() {
  useDocumentTitle('Entrar')
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: 'onTouched', defaultValues: { email: '', password: '' } })

  if (status === 'authenticated') return <Navigate to={next} replace />

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      const user = await login(values)
      // Organizador sem destino explícito vai direto para o painel.
      navigate(next === '/' && user.role === 'ORGANIZER' ? '/org/dashboard' : next, { replace: true })
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível entrar. Tente novamente.')
    }
  })

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Acesse seus ingressos, pedidos e dados."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to={`/cadastro${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <Alert title={formError} />}
        <TextField label="E-mail" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <PasswordField label="Senha" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
        <div className="-mt-1 text-right text-[13px]">
          <Link to="/recuperar-senha">Esqueci minha senha</Link>
        </div>
        <Button type="submit" size="lg" block disabled={isSubmitting}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>

      {USE_MOCKS && (
        <div className="mt-6 callout p-4 text-[13px]">
          <b>Ambiente de simulação.</b> Esta autenticação é fictícia (não usa JWT).
          <div className="text-muted mt-1">
            Conta de demonstração: <span className="font-mono">{DEMO_EMAIL}</span> · senha{' '}
            <span className="font-mono">{DEMO_PASSWORD}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setValue('email', DEMO_EMAIL, { shouldValidate: true })
                setValue('password', DEMO_PASSWORD, { shouldValidate: true })
              }}
            >
              Preencher conta de demonstração
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setValue('email', ORGANIZER_EMAIL, { shouldValidate: true })
                setValue('password', DEMO_PASSWORD, { shouldValidate: true })
              }}
            >
              Preencher conta de organizador
            </Button>
          </div>
        </div>
      )}
    </AuthLayout>
  )
}
