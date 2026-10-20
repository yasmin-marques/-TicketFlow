# TicketFlow

Plataforma web para descoberta de eventos, venda e reserva de ingressos e gerenciamento de eventos. O TicketFlow oferece uma experiência integrada para compradores e organizadores, incluindo seleção de ingressos, reservas de assentos, pagamentos, ingressos digitais e controle de acesso.

## Funcionalidades

### Descoberta de eventos
- Página inicial com eventos em destaque.
- Catálogo com busca, filtros e categorias.
- Página de detalhes dos eventos.
- Exibição de informações sobre datas, locais, lotes e disponibilidade.

### Experiência do comprador
- Cadastro e autenticação.
- Seleção de ingressos e assentos.
- Reservas com prazo de expiração.
- Processo de checkout e acompanhamento de pedidos.
- Ingressos digitais com QR Code.
- Gerenciamento de conta e ingressos adquiridos.

### Gerenciamento de eventos
- Dashboard para organizadores.
- Criação, edição e publicação de eventos.
- Gerenciamento de lotes, ingressos e assentos.
- Acompanhamento de pedidos e participantes.
- Check-in por QR Code.
- Relatórios e indicadores operacionais.

## Tecnologias

**Frontend**
- React 19
- TypeScript
- Vite
- React Router
- Tailwind CSS
- TanStack Query
- Axios
- Lucide
- React Hook Form e Zod

**Backend**
- Java 21
- Spring Boot
- Spring Security
- PostgreSQL
- Redis
- Apache Kafka
- Flyway

**Infraestrutura e ferramentas**
- Docker e Docker Compose
- API REST
- Server-Sent Events (SSE)
- Git e GitHub

## Arquitetura

O projeto é organizado em duas partes principais:

- **Frontend:** interface responsiva para compradores e organizadores, com componentes reutilizáveis, gerenciamento de estado e integração com a API.
- **Backend:** serviços responsáveis pelas regras de negócio, autenticação, persistência, reservas, pedidos, pagamentos e gerenciamento de eventos.

O frontend pode funcionar com dados simulados durante o desenvolvimento ou consumir a API real do backend.

## Requisitos

- Node.js 20 ou superior.
- Docker Desktop com Docker Compose.
- Git.

Não é necessário instalar Java, Maven, PostgreSQL, Redis ou Kafka individualmente quando os serviços correspondentes são executados pelos contêineres Docker.

## Como executar

### 1. Clonar o repositório

```bash
git clone <URL_DO_REPOSITORIO>
cd TicketFlow
```

### 2. Configurar o ambiente

Copie o arquivo de exemplo do backend para a raiz do projeto.

No PowerShell:

```powershell
Copy-Item backend/.env.example .env
```

Configure as variáveis obrigatórias no `.env`, incluindo as credenciais do banco de dados e os segredos de autenticação. Consulte `backend/README.md` para obter as instruções completas.

Crie também o arquivo `.env.local` na raiz do projeto:

```dotenv
VITE_USE_MOCKS=true
VITE_API_URL=http://localhost:8080/api
```

Para utilizar o backend real, altere `VITE_USE_MOCKS` para `false`.

### 3. Iniciar o backend e a infraestrutura

Com o Docker Desktop em execução, execute:

```bash
docker compose up --build -d
```

Confira o estado dos serviços:

```bash
docker compose ps
```

O Compose inicia os serviços definidos na configuração do projeto.

### 4. Iniciar o frontend

Em outro terminal, na raiz do projeto:

```bash
npm install
npm run dev
```

A aplicação estará disponível em:

**http://localhost:5173**

### 5. Encerrar os serviços

Para parar os contêineres sem remover os dados persistidos:

```bash
docker compose down
```

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor de desenvolvimento. |
| `npm run build` | Gera a versão de produção. |
| `npm run preview` | Executa uma prévia do build. |
| `npm run typecheck` | Verifica os tipos TypeScript. |

## Desenvolvimento

O projeto utiliza componentes reutilizáveis e organização por domínio para facilitar a manutenção e a evolução das funcionalidades.

Durante o desenvolvimento, os mocks permitem explorar os fluxos da interface sem depender da API. Para testar a aplicação integrada, utilize `VITE_USE_MOCKS=false` e mantenha o backend disponível.

A integração com serviços externos, como gateways de pagamento e envio de notificações, depende das configurações e implementações correspondentes no backend.

## Documentação

- [Documentação do backend](backend/README.md)
- [Contratos da API](docs/API-CONTRACTS.md)
- [Documentação do frontend](FRONTEND_STATUS.md)

## Segurança

- Não versione arquivos `.env` nem credenciais.
- Utilize segredos fortes e exclusivos por ambiente.
- Não utilize contas ou credenciais de demonstração em produção.
- Antes de disponibilizar a aplicação publicamente, revise autenticação, autorização, pagamentos, configuração de CORS, HTTPS e armazenamento de dados.