import { Container } from '@/components/ui/Container'
import { CategoryGrid } from '@/features/events/components/CategoryGrid'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export function CategoriesPage() {
  useDocumentTitle('Categorias')
  return (
    <Container className="py-8 lg:py-10">
      <h1 className="mb-4 text-[32px] lg:text-[42px]">Categorias</h1>
      <CategoryGrid />
    </Container>
  )
}
