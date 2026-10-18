# TicketFlow — Backend

API REST do TicketFlow (Java 21 · Spring Boot 3.5 · PostgreSQL · Redis · Kafka). Estado atual: **Partes 1 e 2 de 3** — fundação,
autenticação, catálogo público e o **núcleo transacional** (reservas, concorrência, idempotência, pedidos, pagamentos, ingressos,
tempo real). O painel do organizador (Parte 3) **ainda não existe**: as rotas `/api/org/**` e `/api/admin/**` já são protegidas por
papel, mas não têm controllers.

## O que funciona hoje × o que depende de terceiros

| Funcional e testado (infra real via Testcontainers) | Depende de credenciais / sistema externo |
|---|---|
| Cadastro, login, JWT, refresh com rotação, recuperação de senha | **Envio de e-mail** (`PasswordResetNotifier`, `NotificationSender`): hoje só log, sem dados pessoais. Falta um provedor SMTP/SES |
| Catálogo público com filtros | **Gateway de pagamento real** (`PaymentProvider`): só existe o **sandbox** (perfis `dev`/`test`, não cobra nada). Fora deles, pagamentos respondem `503 PAYMENT_PROVIDER_UNAVAILABLE` |
| Lotes, mapa de assentos, reservas de 10 min, expiração, liberação de estoque | **Tokenização de cartão** no navegador (SDK do gateway): o servidor só aceita `token` |
| Disputa de assentos/estoque sem venda duplicada, idempotência persistente | **Segredo de webhook** (`TF_WEBHOOK_SECRET`) combinado com o gateway; a **URL pública** do webhook |
| Pedidos (cartão pago, Pix/boleto pendentes), reembolso, expiração de pendentes | Cobrança, Pix e boleto **reais** (hoje simulados pelo sandbox) |
| Webhook com assinatura HMAC, anti-replay, idempotente | Provisionamento de Redis/Kafka gerenciados em produção |
| Ingressos com QR assinado, transferência, lista de espera | Verificação de e-mail no cadastro (relevante para transferência a quem ainda não tem conta) |
| SSE de assentos (Redis pub/sub, reconexão, limpeza de conexões) | |
| Outbox transacional → Kafka → consumidores idempotentes | |

## Executar

Pré-requisitos: JDK 21 e Docker (PostgreSQL/Redis/Kafka locais e testes de integração).

```bash
# 1. variáveis (nenhum segredo é versionado)
cp backend/.env.example .env      # preencha TF_DB_PASSWORD, TF_JWT_SECRET e TF_QR_SECRET (openssl rand -base64 48)

# 2a. tudo em contêineres (PostgreSQL + Redis + Kafka + API) a partir da raiz do repositório
docker compose up --build

# 2b. ou só a infraestrutura em contêiner e a API na máquina
docker compose up -d postgres redis kafka
cd backend
export $(grep -v '^#' ../.env | xargs)      # PowerShell: defina as variáveis TF_* manualmente
export TF_DB_URL=jdbc:postgresql://localhost:5432/ticketflow TF_KAFKA_BOOTSTRAP=localhost:29092
SPRING_PROFILES_ACTIVE=dev ./mvnw spring-boot:run
```

* Portas do host configuráveis se estiverem ocupadas: `TF_DB_PORT`, `TF_REDIS_PORT`, `TF_KAFKA_PORT` (o broker anuncia `localhost:29092` — mantenha essa porta para a API fora do Docker).
* API: <http://localhost:8080/api> · Swagger UI: <http://localhost:8080/api/swagger-ui.html> · OpenAPI: `/api/docs` · Saúde: `GET /actuator/health`
* **Perfil `dev`:** cria o catálogo de demonstração (os mesmos 26 eventos dos mocks, com lotes, tipos de ingresso e mapas de assentos equivalentes,
  datas relativas a hoje), ativa o **provedor de pagamento sandbox** (banner `WARN` no log), o endpoint `POST /api/dev/orders/{id}/simulate-payment`
  e o log DEBUG do link de redefinição de senha. Sem o perfil, o banco começa só com os dados de referência.
* Sandbox: cartão = token `tok_<4 dígitos>` (aprova; `tok_0002` recusa). Webhooks: assine com `X-TF-Signature` (ver `docs/API-CONTRACTS.md` §11.6).
* Promover alguém a organizador/admin (sem endpoint nesta etapa):

```sql
insert into user_roles (user_id, role_id)
select u.id, r.id from users u, roles r where lower(u.email) = 'voce@exemplo.com' and r.name = 'ORGANIZER';
```

## Testes e build

```bash
cd backend
./mvnw verify          # compila, roda os testes e empacota target/ticketflow-backend.jar
```

Os testes de integração sobem **PostgreSQL 16, Redis 7 e Kafka** reais (Testcontainers) e **exigem Docker** (a 1ª execução baixa as imagens).

| Requisito | Onde é provado |
|---|---|
| Dois compradores disputando o mesmo assento: só um reserva | `ReservationsIntegrationTest.ofManyBuyersRacingForTheSameSeatExactlyOneWins` (8 threads) |
| Repetição idempotente sem efeito duplicado | `…repeatingTheSameIdempotentRequestHasNoDuplicateEffects`, `…concurrentDuplicatesOfTheSameKeyProduceASingleReservation`, `OrdersIntegrationTest` (replay do pedido e do 402) |
| Expiração e liberação de estoque | `…reservationsExpireAfterTenMinutesAndReleaseStock`, `…anExpiredHoldIsImmediatelyAvailableToOthersEvenBeforeTheCleanupJobRuns` |
| Falha de pagamento mantém a reserva ativa | `OrdersIntegrationTest.aDeclinedPaymentChargesNothingAndKeepsTheReservationActive` |
| Pagamento confirmado emite ingressos sem duplicar | `…anApprovedCardPaymentIssuesTicketsExactlyOnce`, `…pixOrdersStayPendingHoldingStockUntilTheWebhookConfirms` |
| Webhook repetido sem efeito duplicado | `…aRepeatedWebhookHasNoDuplicateEffects`, `…webhooksWithBadOrStaleSignaturesAreRejected` |
| Checkouts concorrentes sem venda duplicada | `…concurrentCheckoutsOfTheSameReservationCreateOneOrder`, `…concurrentBuyersNeverSellMoreThanTheStock` |
| Acesso indevido a reservas, pedidos e ingressos | `…usersCannotSeeOrChangeEachOthersReservationsOrdersAndTickets` |
| Tempo real (SSE) | `SeatStreamIntegrationTest` (servidor HTTP real, Redis real) |
| Outbox → Kafka → consumidor idempotente | `OutboxKafkaIntegrationTest` |

Mais: autenticação/autorização/catálogo (Parte 1), transferência e QR (`TicketsIntegrationTest`), e testes unitários (rotação do refresh token, assinatura de
webhook, provedor sandbox, validação de comprador/CPF, regras de senha, `Money`, períodos de data, disponibilidade de lotes).

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `TF_DB_URL` / `TF_DB_USER` / `TF_DB_PASSWORD` | — | Conexão JDBC com o PostgreSQL |
| `TF_REDIS_HOST` / `TF_REDIS_PORT` / `TF_REDIS_PASSWORD` | `localhost` / `6379` / — | Redis (pub/sub do SSE, limitador de login) |
| `TF_KAFKA_BOOTSTRAP` | `localhost:9092` | Brokers Kafka (outbox → eventos) |
| `TF_JWT_SECRET` | *(vazio)* | Segredo HS256, **≥ 32 bytes**. Vazio = chave efêmera (só desenvolvimento) |
| `TF_QR_SECRET` | *(vazio)* | HMAC dos QR Codes, **≥ 32 bytes**. Vazio = efêmero. Trocar invalida os QR emitidos |
| `TF_WEBHOOK_SECRET` | *(vazio)* | HMAC compartilhado com o gateway. Vazio = **todos** os webhooks são recusados |
| `TF_COOKIE_SECURE` | `true` | `Secure` do cookie do refresh. `false` apenas em `http://localhost` |
| `TF_CORS_ORIGINS` / `TF_APP_URL` | `http://localhost:5173` | Origens do frontend / base dos links de recuperação |
| `TF_SWAGGER_ENABLED` | `true` | Desligue em produção se a documentação não deve ser pública |
| `PORT` | `8080` | Porta HTTP |

Ajustes finos em `application.yml` (`tf.sales.*`: TTL da reserva = 10 min, limite por pedido = 6, janela de reembolso, TTL Pix/boleto; `tf.jobs.*`; `tf.redis.enabled`, `tf.kafka.enabled`).

## Como a consistência é garantida

**O PostgreSQL é a fonte da verdade.** Redis e Kafka são auxiliares: se falharem, nada é vendido em duplicidade.

* **Assentos:** `event_seats` com estado `AVAILABLE/RESERVED/SOLD`. Reservar = `SELECT … FOR UPDATE` dos assentos pedidos **em ordem de id** (sem deadlock),
  validação e atualização na mesma transação; quem chega depois espera o commit e recebe `409 SEAT_UNAVAILABLE` com sugestões. Um hold vencido conta como livre
  imediatamente (sem depender do job). `CHECK` de coerência (`RESERVED` sempre tem dono e prazo).
* **Estoque sem assento:** `UPDATE ticket_lots SET quantity_held = quantity_held + :q WHERE sold + held + :q <= total` — atômico; `CHECK (sold + held <= total)` é a barreira final.
* **Uma reserva ativa por usuário:** índice único parcial. **Um pedido por reserva:** `UNIQUE(orders.reservation_id)` + reserva travada durante o checkout.
* **Ingressos:** `UNIQUE(order_id, slot)` e índice único parcial por assento ativo — emissão idempotente.
* **Prazo:** `expires_at` é gravado na criação (em ms) e nunca renovado; reservas vencidas são liberadas por job (`FOR UPDATE SKIP LOCKED`, seguro com várias instâncias),
  na criação de nova reserva do evento e no primeiro uso da reserva vencida (`410`).
* **Idempotência (`Idempotency-Key`):** a chave é reservada numa transação própria (`INSERT … ON CONFLICT DO NOTHING`); a ação e o registro da resposta são confirmados **juntos**;
  erros 4xx definitivos também ficam registrados; falhas inesperadas liberam a chave. Chave igual com corpo diferente → `422`.
* **Pagamento:** o provedor recebe uma chave de idempotência estável por reserva (repetir não cobra duas vezes). Recusa → `402` e rollback total (reserva intacta).
  A chamada ao gateway ocorre dentro da transação do checkout; com um gateway real, mantenha o timeout curto (a idempotência no gateway cobre o caso "cobrou e o commit falhou").
* **Tempo real:** mudanças de assento são publicadas **após o commit** (Redis pub/sub → todas as instâncias → SSE). É "melhor esforço" por desenho; `GET /seats` e o resync do `Last-Event-ID` recuperam qualquer perda.
* **Transactional Outbox:** eventos de negócio são gravados em `outbox_events` na mesma transação da mudança; um relay publica no Kafka (ao-menos-uma-vez, em ordem, `acks=all`, produtor idempotente);
  consumidores gravam `(consumer, event_id)` em `processed_events` na mesma transação dos seus efeitos. Kafka fora do ar não perde eventos: ficam no banco até o envio.
* **Concorrência inesperada:** deadlock, falha de versão otimista ou violação de restrição viram `409` (`CONCURRENT_UPDATE`/`CONFLICT`) — nunca `500` — e podem ser repetidos com a mesma chave.

## Segurança

* Cartão: o servidor **não processa, grava nem registra** número/CVV — corpo com esses campos é recusado antes de qualquer persistência. Só `last4`/bandeira devolvidos pelo gateway são guardados.
* Cada usuário só acessa os próprios recursos: reservas, pedidos e ingressos de outros respondem **`404`** (não revelam existência). A identidade vem sempre do JWT validado.
* Webhooks: HMAC-SHA256 do corpo cru + timestamp com tolerância + `event_id` único + estado do pedido; resposta de falha genérica (`401 INVALID_SIGNATURE`).
* QR: `TF1.<ticketId>.<versão>.<HMAC>`; a versão sobe na transferência (o QR antigo deixa de valer). O check-in (Parte 3) deve validar assinatura **e** versão/estado no banco.
* Limitador de login e refresh/senha como na Parte 1; o limitador agora usa **Redis** (falha aberta se o Redis cair) e chaves em hash.
* Fora de dev/test, sem gateway implementado, **nada é cobrado**: `503 PAYMENT_PROVIDER_UNAVAILABLE`.

## Autenticação (Parte 1)

* **Access token:** JWT HS256, 15 min, claims `sub`, `roles`, `name`, `email`; enviado em `Authorization: Bearer`.
* **Refresh token:** 256 bits, só o **hash SHA-256** no banco; cookie `tf_refresh` (`HttpOnly`, `SameSite=Lax`, `Path=/api/auth`, `Secure` conforme `TF_COOKIE_SECURE`).
  Cada uso rotaciona; reutilizar um token já rotacionado (fora de 10 s de tolerância) revoga a família. O corpo não traz o refresh token (`tf.security.refresh.expose-in-body`).
* **Senhas:** BCrypt (12); login igual para e-mail inexistente e senha errada; bloqueio de 15 min após 5 falhas por e-mail+IP.
* **Recuperação:** `forgot-password` sempre `200`; token aleatório, de uso único, 1 h, em hash; ao redefinir, todas as sessões caem.
* **Autorização:** por papel no backend (`/api/org/**` → ORGANIZER/ADMIN, `/api/admin/**` → ADMIN, demais `/api/**` autenticadas; o resto é negado).

## Dinheiro, datas e contrato

Centavos (`BIGINT`) no banco, **reais** na API; `TIMESTAMPTZ` em UTC no banco e ISO 8601 com offset de São Paulo na API. `city` aceita `"São Paulo, SP"`.
Parâmetros inválidos → `400 INVALID_PARAMETER`. Contratos completos e diferenças em relação aos mocks: `docs/API-CONTRACTS.md` §10 e §11.

## Estrutura

```
backend/src/main/java/br/com/ticketflow
├── auth/          identidade, JWT, refresh, recuperação de senha
├── catalog/       eventos, categorias, busca (Criteria API), seed de demonstração
├── sales/         mapa de assentos, reservas, estoque atômico (LotStock), holds, expiração, lista de espera, SSE de assentos (web)
├── orders/        pedidos, validação do comprador, transições (pago/expirado/reembolsado) e emissão
├── tickets/       ingressos, QR assinado, transferência
├── payment/       PaymentProvider, sandbox (dev/test), não configurado (prod), webhooks, confirmação
├── idempotency/   Idempotency-Key persistente
├── outbox/        outbox transacional, relay Kafka, consumidores idempotentes
├── realtime/      registro de conexões SSE, publicação pós-commit, Redis pub/sub
├── organization/  organizações e membros · user/ perfil · security/ filter chain · config/ · shared/port/ · common/
backend/src/main/resources/db/migration   V1 identidade · V2 catálogo · V3 dados de referência · V4 vendas/pedidos/ingressos/outbox
```

## Limitações conhecidas

* Sem envio real de e-mail; sem verificação de e-mail no cadastro; sem MFA.
* Sem gateway real: Pix/boleto/cartão só no sandbox. Estorno de pagamento tardio e reembolsos dependem do provedor real implementar `refund`.
* Pedido pendente (Pix/boleto) mantém assentos/estoque segurados até o prazo; o prazo do Pix é 30 min e do boleto 3 dias (configuráveis).
* `PATCH /api/me` e cartões salvos não existem. Sem endpoint para promover usuários. `coverUrl` sempre `null`. Limite por cliente (`per_customer_limit` do lote) ainda não é aplicado entre pedidos — só `maxPerOrder`.
* O stream SSE é público (o mapa também); o token em `?access_token=` serve para não eco das próprias ações. Cuidado com logs de acesso que gravem a query string em proxies.
* Check-in, relatórios e painel do organizador: Parte 3.
