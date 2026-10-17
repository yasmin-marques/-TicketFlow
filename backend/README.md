# TicketFlow — Backend

API REST do TicketFlow (Java 21 · Spring Boot 3.5 · PostgreSQL). Esta é a **Parte 1 de 3**: fundação executável,
autenticação e catálogo público. Reservas, pedidos/pagamento e painel do organizador **ainda não existem** (as rotas
`/api/org/**` e `/api/admin/**` já são protegidas por papel, mas não têm controllers).

## O que está implementado

| Área | Conteúdo |
|---|---|
| Fundação | Migrations Flyway (fonte da verdade do schema; `ddl-auto=validate`), tratador global de erros `{status, code, message}`, Actuator, Swagger/OpenAPI, CORS com credenciais |
| Identidade | Usuários, papéis (`USER`/`ORGANIZER`/`ADMIN`), permissões, organizações e membros |
| Autenticação | Cadastro, login, JWT de acesso curto, refresh token opaco com rotação, logout, recuperação/redefinição de senha |
| Catálogo público | `GET /api/events` (busca, cidade, período, categorias, preço, ordenação, paginação), `/featured`, `/upcoming`, `/suggest`, `/{slug}`, `/{slug}/related`, `GET /api/categories`, `GET /api/me` |

Apenas eventos **publicados** e **ainda não encerrados** aparecem no catálogo (rascunhos e eventos passados dão `404` no detalhe).
Eventos esgotados continuam visíveis, com o selo `soldOut`.

## Executar

Pré-requisitos: JDK 21 e Docker (PostgreSQL local e testes de integração).

```bash
# 1. variáveis (nenhum segredo é versionado)
cp backend/.env.example .env      # edite TF_DB_PASSWORD e TF_JWT_SECRET (openssl rand -base64 48)

# 2a. tudo em contêineres (PostgreSQL + API) a partir da raiz do repositório
docker compose up --build

# 2b. ou só o banco em contêiner e a API na máquina
docker compose up -d postgres
cd backend
export $(grep -v '^#' ../.env | xargs)      # PowerShell: defina as variáveis TF_* manualmente
export TF_DB_URL=jdbc:postgresql://localhost:5432/ticketflow
SPRING_PROFILES_ACTIVE=dev ./mvnw spring-boot:run
```

* API: <http://localhost:8080/api> · Swagger UI: <http://localhost:8080/api/swagger-ui.html> · OpenAPI: `/api/docs`
* Saúde: `GET /actuator/health`
* Perfil `dev`: cria o **catálogo de demonstração** (os mesmos 26 eventos dos mocks do frontend, com datas relativas a hoje),
  cookie sem `Secure` e log DEBUG (o link de redefinição de senha aparece no log). Sem o perfil, o banco começa só com os
  dados de referência (papéis, permissões, categorias).

Usuários de teste **não** são criados pelo seeder: cadastre-se pela tela ou por `POST /api/auth/register`.
Para virar organizador/admin, altere o papel direto no banco (não há endpoint de promoção nesta etapa):

```sql
insert into user_roles (user_id, role_id)
select u.id, r.id from users u, roles r where lower(u.email) = 'voce@exemplo.com' and r.name = 'ORGANIZER';
```

## Testes e build

```bash
cd backend
./mvnw verify          # compila, roda os testes e empacota target/ticketflow-backend.jar
```

* **Unitários** (JUnit 5 + Mockito): rotação/reutilização/expiração do refresh token, regra de senha, `Money`, `Texts`,
  períodos de data no fuso de São Paulo, recálculo de disponibilidade.
* **Integração** (Testcontainers, PostgreSQL 16 real + migrations; **exige Docker**): cadastro, login (inclusive bloqueio por
  tentativas e não enumeração), refresh/logout, recuperação de senha de uso único, autorização por papel (401/403, token
  expirado, emissor forjado) e todo o catálogo (visibilidade, filtros, ordenação, paginação, formato do contrato).

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `TF_DB_URL` / `TF_DB_USER` / `TF_DB_PASSWORD` | — | Conexão JDBC com o PostgreSQL |
| `TF_JWT_SECRET` | *(vazio)* | Segredo HS256, **≥ 32 bytes**. Vazio = chave efêmera (tokens morrem ao reiniciar; só para desenvolvimento) |
| `TF_COOKIE_SECURE` | `true` | `Secure` do cookie do refresh. Use `false` apenas em `http://localhost` |
| `TF_CORS_ORIGINS` | `http://localhost:5173` | Origens do frontend (lista separada por vírgula) |
| `TF_APP_URL` | `http://localhost:5173` | Base dos links de recuperação de senha |
| `TF_SWAGGER_ENABLED` | `true` | Desligue em produção se a documentação não deve ser pública |
| `PORT` | `8080` | Porta HTTP |

## Autenticação

* **Access token:** JWT HS256, 15 min, claims `sub`, `roles`, `name`, `email`; enviado em `Authorization: Bearer`.
* **Refresh token:** valor aleatório de 256 bits, guardado **apenas como hash SHA-256**; viaja num cookie
  `tf_refresh` (`HttpOnly`, `SameSite=Lax`, `Path=/api/auth`, `Secure` conforme `TF_COOKIE_SECURE`). Cada uso **rotaciona** o
  token; reutilizar um token já rotacionado (fora de uma tolerância de 10 s para abas simultâneas) **revoga a família inteira**.
  O corpo da resposta não traz o refresh token (`tf.security.refresh.expose-in-body=true` reabilita, para clientes sem cookies).
* **Senhas:** BCrypt (força 12). Login responde igual para e-mail inexistente e senha errada, com tempo equalizado.
  Bloqueio de 15 min após 5 falhas por e-mail+IP (em memória; vira Redis na Parte 2).
* **Recuperação:** `forgot-password` responde sempre `200 {accepted:true}`; o token é aleatório, de uso único, expira em
  1 h e é guardado como hash. Ao redefinir, todas as sessões do usuário são encerradas. Ainda **não há envio de e-mail**:
  `PasswordResetNotifier` só registra o link em DEBUG (ponto de extensão para SMTP/SES).
* **Autorização:** feita no backend por papel (`/api/org/**` → ORGANIZER/ADMIN, `/api/admin/**` → ADMIN, demais rotas
  `/api/**` autenticadas; tudo o que não é mapeado é negado).

## Dinheiro, datas e contrato

* Valores são guardados em **centavos** (`BIGINT`) e expostos em **reais** (`120.5`), como o frontend espera.
* Datas: `TIMESTAMPTZ` em UTC no banco; ISO 8601 **com offset de São Paulo** na API.
* `distanceKm` é calculado a partir de uma origem padrão (centro de São Paulo, configurável em `tf.catalog`) ou de
  `lat`/`lng` na consulta. `city` aceita o formato do frontend: `"São Paulo, SP"`.
* Parâmetros inválidos (`sort`, `when`, datas, preços) → `400 INVALID_PARAMETER`; `pageSize` é limitado a 100.

## Estrutura

```
backend/src/main/java/br/com/ticketflow
├── auth/          domain · repository · service · web (controllers, DTOs, cookie, validação de senha)
├── catalog/       domain · repository (Criteria API) · service · web · seed (dados de demonstração)
├── organization/  organizações e membros
├── user/          perfil (GET /api/me)
├── security/      filter chain, JWT → papéis, respostas 401/403
├── config/        propriedades tipadas, JWT, relógio, OpenAPI
├── shared/port/   portas para infraestrutura (limitador de login, notificador de e-mail)
└── common/        ApiException/ApiError, handler global, Money, Texts
backend/src/main/resources/db/migration   V1 identidade · V2 catálogo · V3 dados de referência
```

Decisões relevantes: busca por `search_text` normalizado (sem acentos) com índice trigram; preço mínimo/esgotado/“últimos
ingressos” **denormalizados** em `events` e recalculados a partir dos lotes (listagem sem junções pesadas e sem N+1);
entidades JPA nunca saem pela API (DTOs).

## Preparado para a Parte 2

* `LoginAttemptLimiter` (porta) → implementação Redis; o mesmo vale para cache do catálogo e locks de assento.
* `PasswordResetNotifier` (porta) → eventos/e-mail via Kafka ou provedor SMTP.
* O `docker-compose.yml` da raiz é onde Redis e Kafka entrarão.
* Colunas `version` (lock otimista) já existem em eventos e lotes para a reserva concorrente.

## Limitações conhecidas

* Sem envio real de e-mail; sem verificação de e-mail no cadastro; sem MFA.
* Limitador de login em memória (não compartilhado entre instâncias).
* `PATCH /api/me` e cartões salvos ainda não existem (o frontend continua usando os mocks para eles).
* Sem endpoint para promover usuários a organizador/admin.
* Imagens de capa (`coverUrl`) são sempre `null` até existir upload.
