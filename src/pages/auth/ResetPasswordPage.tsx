import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { PasswordField } from '@/components/ui/PasswordField'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { passwordSchema } from '@/lib/validation'
import { authService } from '@/services/api/auth.service'
import { ApiError } from '@/services/api/http'

const schema = z
  .object({ password: passwordSchema, confirm: z.string().min(1, 'Confirme a senha') })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não conferem' })
type Values = z.infer<typeof schema>

export function ResetPasswordPage() {
  useDocumentTitle('Redefinir senha')
  const [params] = useSearchParams()
  const token = params.get('token')
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: 'onTouched' })

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null)
    try {
      await authService.resetPassword(token ?? '', password)
      setDone(true)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível redefinir. Tente novamente.')
    }
  })

  if (!token) {
    return (
      <AuthLayout title="Link inválido" footer={<Link to="/recuperar-senha">Pedir um novo link</Link>}>
        <Alert title="Este link de redefinição não é válido ou expirou." />
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout title="Senha atualizada">
        <div role="status" className="mb-4 border-2 border-text p-4 text-sm">
          <span className="font-extrabold text-success">✓</span> Sua senha foi alterada. Entre com a nova senha.
        </div>
        <Button to="/entrar" size="lg" block>
          Entrar
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Nova senha" subtitle="Escolha uma senha com ao menos 8 caracteres, letras e números.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <Alert title={formError}>{' '}<Link to="/recuperar-senha">Pedir um novo link</Link></Alert>}
        <PasswordField label="Nova senha" autoComplete="new-password" error={errors.password?.message} {...register('password')} />
        <PasswordField label="Confirmar nova senha" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm')} />
        <Button type="submit" size="lg" block disabled={isSubmitting}>
          {isSubmitting ? 'Salvando…' : 'Salvar nova senha'}
        </Button>
      </form>
    </AuthLayout>
  )
}
