import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

interface ComingSoonPageProps {
  title: string
  description?: string
}

/**
 * Destino provisório das rotas das próximas partes (checkout, autenticação,
 * conta e institucional), para que a navegação nunca caia em link quebrado.
 */
export function ComingSoonPage({ title, description }: ComingSoonPageProps) {
  useDocumentTitle(title)
  return (
    <Container className="flex min-h-[420px] flex-col py-12 lg:py-14">
      <div className="kicker text-[11px] tracking-[0.1em] text-accent-700">Em construção</div>
      <h1 className="mt-3 mb-2 text-[36px] lg:text-[56px]">{title}</h1>
      <p className="max-w-[460px]">
        {description ?? 'Esta tela faz parte de uma próxima etapa do TicketFlow e ainda não está disponível.'}
      </p>
      <div className="mt-8 flex flex-wrap gap-2">
        <Button to="/eventos" size="lg">
          Explorar eventos
        </Button>
        <Button to="/" variant="secondary" size="lg">
          Voltar ao início
        </Button>
      </div>
    </Container>
  )
}
