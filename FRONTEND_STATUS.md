
# TicketFlow — Frontend

Frontend web do TicketFlow, uma plataforma de descoberta de eventos, compra de ingressos e gerenciamento de eventos. A aplicação oferece interfaces para visitantes, compradores e organizadores, com foco em responsividade, usabilidade e integração com o backend Spring Boot.

## Funcionalidades

### Descoberta de eventos

- Página inicial com carrossel automático de eventos em destaque.
- Catálogo de eventos com busca, filtros, categorias e ordenação.
- Detalhes dos eventos, programação, localização e informações sobre ingressos.
- Navegação responsiva para desktop e dispositivos móveis.
- Imagens de eventos com carregamento otimizado e fallbacks.

### Compra de ingressos

- Cadastro, login e recuperação de senha.
- Seleção de tipos, lotes e quantidades de ingressos.
- Mapa de assentos e reservas temporárias.
- Checkout com dados do comprador e opções de pagamento.
- Acompanhamento de pedidos e estados de pagamento.
- Ingressos digitais com QR Code.
- Consulta e gerenciamento dos ingressos adquiridos.
- Perfil e configurações da conta.

### Painel do organizador

- Dashboard com indicadores e informações sobre vendas.
- Criação, edição e publicação de eventos.
- Gerenciamento de lotes e mapas de assentos.
- Consulta e gerenciamento de pedidos.
- Participantes e controle de acesso.
- Check-in por QR Code ou código digitado.
- Relatórios de vendas e ocupação.
- Gerenciamento da organização, equipe e configurações.

## Identidade visual

O frontend utiliza um design system compartilhado, com componentes reutilizáveis e tokens de estilo para manter a consistência visual entre as áreas pública, de compra e administrativa.

Principais características:

- Interface clara e responsiva.
- Componentes com cantos arredondados.
- Sombras discretas e superfícies diferenciadas.
- Tipografia e espaçamento consistentes.
- Estados visuais de foco, carregamento, sucesso e erro.
- Microinterações e transições suaves.
- Suporte à preferência por movimento reduzido.

A paleta de cores original foi preservada durante o refinamento visual.

### Carrossel de eventos

A página inicial possui um carrossel de eventos em destaque com:

- Troca automática a cada cinco segundos.
- Navegação por setas, indicadores e teclado.
- Suporte a gestos de navegação em dispositivos móveis.
- Pausa durante interação e quando a aba está oculta.
- Respeito à preferência `prefers-reduced-motion`.

### Imagens dos eventos

O componente `EventImage` centraliza a exibição das capas. A aplicação tenta utilizar a imagem fornecida pela API, recorre aos assets SVG locais disponíveis e apresenta um fallback visual quando necessário.

As imagens SVG locais são utilizadas como recursos temporários de desenvolvimento. O upload e o armazenamento definitivo das capas dependem da integração com um serviço de imagens.

## Tecnologias

- React 19
- TypeScript
- Vite
- React Router
- Tailwind CSS
- TanStack Query
- Axios
- Lucide
- React Hook Form
- Zod
- SVG e CSS para gráficos e elementos visuais

## Arquitetura

O frontend é organizado por responsabilidades e domínios, favorecendo a reutilização de componentes e a manutenção da aplicação.

```text
src/
├── app/          # Providers, roteamento e configuração da aplicação
├── components/   # Componentes de interface e domínio
├── features/     # Funcionalidades organizadas por domínio
├── layouts/      # Estruturas das áreas pública, compra e administração
├── pages/        # Páginas e rotas
├── services/     # Comunicação com a API e serviços auxiliares
├── mocks/        # Adaptadores e dados simulados
├── hooks/        # Hooks reutilizáveis
├── lib/          # Utilitários compartilhados
├── types/        # Tipos TypeScript
└── styles/       # Tokens e estilos globais

public/
└── images/
    └── events/   # Capas SVG locais para desenvolvimento

docs/
├── API-CONTRACTS.md
└── brand/
```

## Requisitos

- Node.js 20 ou superior.
- npm.
- Backend Spring Boot disponível para utilizar a API real.

O Docker Desktop é necessário para executar a infraestrutura completa do projeto conforme a configuração do repositório.

## Instalação e execução

Na raiz do projeto, instale as dependências:

```bash
npm install
```

Crie o arquivo `.env.local` com a configuração desejada.

### Utilizando dados simulados

```dotenv
VITE_USE_MOCKS=true
VITE_API_URL=http://localhost:8080/api
```

Inicie o frontend:

```bash
npm run dev
```

A aplicação estará disponível em `http://localhost:5173`.

### Utilizando o backend real

Configure o `.env.local`:

```dotenv
VITE_USE_MOCKS=false
VITE_API_URL=http://localhost:8080/api
```

Certifique-se de que o backend esteja em execução e acessível antes de iniciar ou validar a aplicação.

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor de desenvolvimento. |
| `npm run build` | Verifica a compilação e gera os arquivos de produção. |
| `npm run preview` | Disponibiliza uma prévia do build. |
| `npm run typecheck` | Verifica os tipos TypeScript. |

## Integração com a API

A comunicação HTTP é centralizada na camada de serviços, utilizando Axios. O frontend pode operar com dados simulados ou consumir a API Spring Boot, conforme a configuração de ambiente.

A integração contempla os principais domínios da aplicação:

- Autenticação e conta.
- Catálogo e detalhes dos eventos.
- Reservas, assentos e pedidos.
- Checkout e pagamentos.
- Ingressos e check-in.
- Painel do organizador.
- Relatórios e configurações.

Os contratos e detalhes da integração estão documentados em [`docs/API-CONTRACTS.md`](docs/API-CONTRACTS.md).

### Dados simulados

O modo de mocks facilita o desenvolvimento e a validação da interface sem depender de todos os serviços externos.

Entretanto, os mocks não substituem as garantias do backend em relação à concorrência, autorização, persistência, pagamentos ou validação de ingressos.

## Validação

O projeto passou por verificações de compilação, tipagem, comportamento do carrossel e navegação responsiva.

A validação de integração com o backend real foi documentada para os principais fluxos de compra e gerenciamento, incluindo autenticação, reservas, pedidos, ingressos e check-in.

A cobertura efetiva deve ser conferida pelos testes disponíveis no repositório e pelos resultados da execução no ambiente atual.

## Limitações conhecidas

- As capas locais são temporárias; o armazenamento e upload definitivos dependem de uma integração específica.
- O gerenciamento de cartões salvos depende da disponibilidade do serviço correspondente no backend.
- A entrega de webhooks e notificações externas depende das integrações implementadas no servidor.
- Alguns indicadores de relatórios dependem dos dados disponibilizados pela API.
- A leitura de QR Code pela câmera depende do suporte do navegador; a entrada manual permanece como alternativa.
- A identidade visual definitiva da marca depende da escolha e aprovação de uma das propostas de logo.

## Próximos passos

- Finalizar e aprovar a identidade visual da marca.
- Implementar armazenamento definitivo para as capas dos eventos.
- Continuar ampliando os testes automatizados e de ponta a ponta.
- Revisar acessibilidade e navegação por teclado.
- Validar os fluxos com o backend real após alterações relevantes.
- Preparar configurações específicas para implantação em produção.

## Documentação relacionada

- [README principal](README.md)
- [README do backend](backend/README.md)
- [Contratos da API](docs/API-CONTRACTS.md)
- [Identidade visual](docs/brand/README.md)