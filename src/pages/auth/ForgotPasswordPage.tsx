import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { emailSchema } from '@/lib/validation'
import { authService } from '@/services/api/auth.service'
import { ApiError, USE_MOCKS } from '@/services/api/http'

const schema = z.object({ email: emailSchema })
type Values = z.infer<typeof schema>

export function ForgotPasswordPage() {
  useDocumentTitle('Recuperar senha')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [resetToken, setResetToken] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: 'onTouched' })

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null)
    try {
      const result = await authService.forgotPassword(email)
      setResetToken(result.resetToken)
      setSentTo(email)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível enviar. Tente novamente.')
    }
  })

  if (sentTo) {
    return (
      <AuthLayout title="Verifique seu e-mail" footer={<Link to="/entrar">← Voltar para entrar</Link>}>
        <div role="status" className="border-2 border-text p-4 text-sm">
          Se existir uma conta para <b>{sentTo}</b>, enviamos um link para redefinir a senha. Ele vale por 1 hora.
        </div>
        {USE_MOCKS && (
          <div className="mt-4 border-2 border-dashed border-neutral-500 p-4 text-[13px]">
            <b>Ambiente de simulação:</b> nenhum e-mail é enviado.
            {resetToken ? (
              <div className="mt-2">
                <Button to={`/redefinir-senha?token=${resetToken}`} variant="secondary">
                  Abrir link de redefinição →
                </Button>
              </div>
            ) : (
              <div className="text-muted mt-1">Nenhuma conta com este e-mail — por segurança a resposta é igual.</div>
            )}
          </div>
        )}
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Informe o e-mail da conta e enviaremos um link para criar uma nova senha."
      footer={<Link to="/entrar">← Voltar para entrar</Link>}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <Alert title={formError} />}
        <TextField label="E-mail" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Button type="submit" size="lg" block disabled={isSubmitting}>
          {isSubmitting ? 'Enviando…' : 'Enviar link'}
        </Button>
      </form>
    </AuthLayout>
  )
}
