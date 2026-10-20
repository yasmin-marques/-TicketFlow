
# TicketFlow — Backend

API REST do TicketFlow, responsável pelas regras de negócio, autenticação, catálogo de eventos, reservas, pedidos, ingressos digitais e ferramentas de gerenciamento para organizadores.

## Tecnologias

- Java 21 e Spring Boot 3.5
- PostgreSQL 16 e Flyway
- Redis 7
- Apache Kafka 3.8
- Maven Wrapper
- Docker e Docker Compose
- OpenAPI / Swagger UI

## Funcionalidades

- Cadastro, autenticação e autorização de usuários.
- Catálogo público de eventos e lotes.
- Criação, edição e publicação de eventos.
- Gerenciamento de lotes e mapas de assentos.
- Reservas com expiração, controle de concorrência e idempotência.
- Pedidos, fluxo de checkout e integração abstrata com pagamentos.
- Ingressos digitais com QR Code assinado.
- Atualizações de disponibilidade em tempo real via Server-Sent Events (SSE).
- Painel do organizador com pedidos, participantes, check-in, relatórios, equipe e configurações.
- Controle de acesso por organização e registro de ações administrativas.

## Requisitos

Para executar a aplicação completa em contêineres, instale o Docker Desktop com Docker Compose.

Para executar a API diretamente na máquina, também é necessário o JDK 21.

## Executar com Docker

Os comandos a seguir devem ser executados na raiz do repositório, onde está o `docker-compose.yml`.

### 1. Configurar o ambiente

Crie o arquivo `.env` a partir do exemplo.

No Windows PowerShell:

```powershell
Copy-Item backend/.env.example .env
```

Edite o `.env` e preencha as variáveis obrigatórias, principalmente:

- `TF_DB_PASSWORD`: senha do PostgreSQL.
- `TF_JWT_SECRET`: segredo de assinatura dos tokens JWT.
- `TF_QR_SECRET`: segredo usado para assinar os QR Codes.

Use segredos fortes e distintos, com pelo menos 32 bytes para `TF_JWT_SECRET` e `TF_QR_SECRET`. Não compartilhe nem versione o arquivo `.env`.

### 2. Iniciar os serviços

```bash
docker compose up --build -d
```

Verifique o estado dos contêineres:

```bash
docker compose ps
```

Para acompanhar os logs da API:

```bash
docker compose logs -f backend
```

Para encerrar os serviços sem apagar os dados persistidos:

```bash
docker compose down
```

Evite `docker compose down -v` quando quiser preservar os dados do banco.

### Portas padrão

| Serviço | Porta no host |
|---|---:|
| API Spring Boot | `8080` |
| PostgreSQL | `5432` |
| Redis | `6379` |
| Kafka | `29092` |

Se uma porta estiver ocupada, consulte as variáveis de porta definidas no `.env.example` e ajuste a configuração correspondente. Quando a API está em um contêiner, ela deve acessar os serviços pelos nomes de serviço do Docker Compose e pelas portas internas da rede Docker.

## Executar a API fora do Docker

É possível executar PostgreSQL, Redis e Kafka em contêineres e iniciar a API localmente.

Primeiro, configure o `.env` na raiz e suba a infraestrutura:

```bash
docker compose up -d postgres redis kafka
```

No PowerShell, configure no terminal as variáveis de ambiente necessárias para o backend, incluindo a conexão JDBC local, o Redis e o endereço do Kafka. Depois, na pasta `backend/`, execute:

```powershell
.\mvnw.cmd spring-boot:run
```

Em Linux ou macOS:

```bash
./mvnw spring-boot:run
```

## Endpoints úteis

Com a API em execução local:

- API base: `http://localhost:8080/api`
- Swagger UI: `http://localhost:8080/api/swagger-ui.html`
- OpenAPI: `http://localhost:8080/api/docs`
- Saúde: `http://localhost:8080/actuator/health`
- Prontidão: `http://localhost:8080/actuator/health/readiness`
- Vivacidade: `http://localhost:8080/actuator/health/liveness`

## Ambiente de desenvolvimento

O perfil `dev` disponibiliza dados e contas de demonstração e utiliza um provedor de pagamento sandbox. Esse modo é destinado a desenvolvimento e testes; ele não realiza cobranças reais.

A senha das contas de demonstração é definida por `TF_DEMO_PASSWORD` (padrão de desenvolvimento: `Demo12345`).

| E-mail | Papel | Uso |
|---|---|---|
| `organizador@ticketflow.dev` | Organizador / proprietário | Gerenciar eventos e acessar o painel |
| `portaria@ticketflow.dev` | Organizador / check-in | Consultar participantes e validar ingressos |
| `comprador@ticketflow.dev` | Comprador | Simular compras e consultar ingressos |

No fluxo de pagamento de desenvolvimento, o cartão de teste `4242 4242 4242 4242` simula aprovação e o cartão `4000 0000 0000 0002` simula recusa. Pix e boleto podem permanecer pendentes até a simulação de pagamento disponibilizada no ambiente de desenvolvimento.

Não use contas, senhas ou mecanismos de sandbox em produção.

## Variáveis de ambiente

Consulte `backend/.env.example` para a lista completa. As principais variáveis incluem:

| Variável | Finalidade |
|---|---|
| `SPRING_PROFILES_ACTIVE` | Perfil da aplicação (`dev`, `test` ou `prod`) |
| `TF_DB_URL` | URL JDBC do PostgreSQL |
| `TF_DB_USER` / `TF_DB_PASSWORD` | Credenciais do banco |
| `TF_REDIS_HOST` / `TF_REDIS_PORT` | Conexão com Redis |
| `TF_KAFKA_BOOTSTRAP` | Endereço dos brokers Kafka |
| `TF_JWT_SECRET` | Segredo de assinatura JWT |
| `TF_QR_SECRET` | Segredo de assinatura dos QR Codes |
| `TF_CORS_ORIGINS` | Origens permitidas para o frontend |
| `TF_APP_URL` | URL base da aplicação frontend |
| `TF_SWAGGER_ENABLED` | Habilita ou desabilita a documentação Swagger |
| `TF_DEMO_PASSWORD` | Senha das contas de demonstração no perfil `dev` |

Em produção, configure segredos por meio do ambiente seguro de implantação, utilize HTTPS e não habilite perfis ou endpoints de desenvolvimento.

## Testes

Na pasta `backend/`, execute:

```bash
./mvnw verify
```

No Windows PowerShell:

```powershell
.\mvnw.cmd verify
```

A verificação compila a aplicação e executa os testes. Os testes de integração que utilizam Testcontainers precisam de Docker disponível.

## Integração com o frontend

O frontend está na raiz do repositório. Para que ele consuma esta API, configure o arquivo `.env.local` do frontend:

```dotenv
VITE_USE_MOCKS=false
VITE_API_URL=http://localhost:8080/api
```

Inicie o frontend em outro terminal com:

```bash
npm install
npm run dev
```

Os contratos consumidos pela interface estão documentados em [`docs/API-CONTRACTS.md`](../docs/API-CONTRACTS.md).

## Segurança

- Não versione `.env`, senhas, tokens ou segredos.
- Use segredos fortes e distintos para JWT e QR Codes.
- Restrinja CORS às origens necessárias.
- Não exponha endpoints de desenvolvimento em produção.
- Não utilize credenciais de demonstração em ambientes públicos.
- Revise autorização, configuração de cookies, HTTPS, backups e observabilidade antes de publicar a aplicação.

## Integrações e limitações

O backend inclui abstrações e fluxos de desenvolvimento para integrações externas. Antes de utilizar o sistema em produção, verifique a configuração e implementação efetiva de:

- Gateway de pagamento e tokenização real de cartões.
- Envio de e-mails e notificações.
- Armazenamento e entrega de imagens de capa.
- Entrega de webhooks de organizações.
- Monitoramento, backups e infraestrutura gerenciada para Redis e Kafka.

No perfil de desenvolvimento, pagamentos são simulados. Não considere o projeto pronto para processar pagamentos reais até que um provedor de pagamento seja integrado e validado.

## Documentação relacionada

- [README principal](../README.md)
- [Contratos da API](../docs/API-CONTRACTS.md)
- [Documentação do frontend](../FRONTEND_STATUS.md)