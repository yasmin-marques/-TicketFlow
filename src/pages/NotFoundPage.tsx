import { StatusPanel } from '@/components/domain/StatusPanel'
import { Button } from '@/components/ui/Button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Página não encontrada')
  return (
    <StatusPanel
      code="404"
      title="Essa página saiu de cartaz."
      description="O link pode estar errado ou o evento foi removido. Veja o que está acontecendo perto de você."
      actions={
        <>
          <Button to="/eventos" size="lg">
            Explorar eventos
          </Button>
          <Button to="/" variant="secondary" size="lg">
            Voltar ao início
          </Button>
        </>
      }
    />
  )
}
