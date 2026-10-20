# TicketFlow — Backend

API REST do TicketFlow (Java 21 · Spring Boot 3.5 · PostgreSQL 16 · Redis 7 · Kafka 3.8 · Flyway). Estado: **Partes 1, 2 e 3 de 3**
— autenticação e catálogo público, núcleo transacional (reservas, concorrência, idempotência, pedidos, pagamentos, ingressos, tempo
real) e o **painel do organizador** (eventos, lotes, mapa de assentos, pedidos, reembolsos, participantes, check-in, dashboard,
relatórios, equipe, webhooks, avisos, busca), com autorização por organização, auditoria e controles de produção.

Contratos completos (o que o frontend consome e onde o backend real difere dos mocks): [`docs/API-CONTRACTS.md`](../docs/API-CONTRACTS.md)
§10 (Parte 1), §11 (Parte 2) e **§12 (Parte 3)**.

## Executar localmente

Pré-requisitos: **JDK 21** e **Docker** (PostgreSQL/Redis/Kafka e testes de integração). Node 18+ para o frontend.

```bash
# 1. variáveis (nenhum segredo é versionado) — na raiz do repositório
cp backend/.env.example .env
#    preencha TF_DB_PASSWORD, TF_JWT_SECRET e TF_QR_SECRET (>= 32 caracteres cada: openssl rand -base64 48)

# 2a. tudo em contêineres (PostgreSQL + Redis + Kafka + API), perfil dev
docker compose up --build
#     porta ocupada? TF_DB_PORT=55432, TF_REDIS_PORT, TF_KAFKA_PORT, TF_API_PORT no .env

# 2b. ou só a infraestrutura em contêiner e a API na máquina
docker compose up -d postgres redis kafka
cd backend
export $(grep -v '^#' ../.env | xargs)          # PowerShell: defina as variáveis TF_* manualmente
export TF_DB_URL=jdbc:postgresql://localhost:5432/ticketflow TF_KAFKA_BOOTSTRAP=localhost:29092
SPRING_PROFILES_ACTIVE=dev ./mvnw spring-boot:run

# 3. frontend apontando para a API real (outro terminal, raiz do repositório)
#    .env.local:  VITE_USE_MOCKS=false   VITE_API_URL=http://localhost:8080/api
npm install && npm run dev                     # http://localhost:5173
```

* API: <http://localhost:8080/api> · Swagger UI: <http://localhost:8080/api/swagger-ui.html> · OpenAPI: `/api/docs`
* Saúde: `GET /actuator/health` · prontidão (banco + Redis): `/actuator/health/readiness` · vivacidade: `/actuator/health/liveness`
* **Perfil `dev`:** catálogo de demonstração (26 eventos, lotes, mapas), **provedor de pagamento sandbox** (não cobra nada), o endpoint
  `POST /api/dev/orders/{id}/simulate-payment` e **contas de demonstração** (senha = `TF_DEMO_PASSWORD`, padrão `Demo12345`):

| Conta | Papel | Para testar |
|---|---|---|
| `organizador@ticketflow.dev` | ORGANIZER · OWNER da "Pulse Produções" (dona do Neon Horizon Festival e de outros eventos do catálogo) | painel inteiro |
| `portaria@ticketflow.dev` | ORGANIZER · CHECKIN da mesma organização | só participantes e check-in |
| `comprador@ticketflow.dev` | USER | compra, ingressos, QR |

* Sandbox: no frontend use o cartão `4242 4242 4242 4242` (vira o token `tok_4242`, aprovado) ou final `0002` (recusado). Pix/boleto
  ficam pendentes; "Simular pagamento" na tela do pedido confirma (só dev).
* Qualquer outro usuário que se cadastrar é `USER`. Para promover alguém a organizador (não há endpoint de administração):

```sql
insert into user_roles (user_id, role_id)
select u.id, r.id from users u, roles r where lower(u.email) = 'voce@exemplo.com' and r.name = 'ORGANIZER';
```
  No primeiro acesso ao painel essa pessoa recebe uma organização própria (como OWNER) e pode adicionar a equipe.

## Testes e build

```bash
cd backend
./mvnw verify          # compila, roda TODOS os testes e empacota target/ticketflow-backend.jar
./mvnw test -Dtest='Org*Test,CheckinIntegrationTest'   # só o painel
```

Os testes de integração sobem **PostgreSQL 16, Redis 7 e Kafka reais** (Testcontainers) e exigem Docker. Última execução local:
**160 testes, 0 falhas** (`./mvnw verify`, 18/10/2026). O que cada requisito prova:

| Requisito | Onde é provado |
|---|---|
| CRUD de eventos, rascunho → publicação → catálogo público | `OrgEventsIntegrationTest.draftIsCreatedEditedAndOnlyAppearsInTheCatalogAfterPublishing` |
| Requisitos de publicação (`PUBLISH_BLOCKED` com a lista) | idem + `…seatMapIsSavedLinkedToLotsAndProtectsSoldSeats` |
| Slug único global, reservado, `exceptId` de outra organização | `…slugsAreGloballyUniqueAndValidated` |
| Despublicar/excluir/editar respeitando vendas; gestão de lotes | `…unpublishDeleteAndEditingRulesRespectSales`, `OrgOrdersAndReportsIntegrationTest.lotPriceChangesOnlyAffectNewReservations` |
| Cancelamento do evento reembolsa pagos, libera reservas e estoque | `…cancellingAnEventRefundsPaidOrdersAndRemovesItFromTheCatalog` |
| Mapa: vãos/bloqueios indisponíveis ao comprador, `409 SEAT_SOLD` | `…seatMapIsSavedLinkedToLotsAndProtectsSoldSeats` |
| Permissões (401/403), papel de membro, papel revogado vale na hora | `OrgAuthorizationIntegrationTest` (todos) |
| **Isolamento entre organizações** (leitura e escrita → 404, filtros não vazam) | `…organizersCannotReachAnotherOrganizationsData` |
| Pedidos: filtros, paginação, reembolso, `409` com ingresso usado | `OrgOrdersAndReportsIntegrationTest.ordersAreFilteredPaginatedAndRefundable` |
| **Relatórios = banco** (receita, vendidos, ocupação, funil, por lote, por dia) | `…dashboardAndReportNumbersMatchTheDatabase` |
| **Check-in concorrente** (12 leituras simultâneas → 1 `valid`) | `CheckinIntegrationTest.concurrentScansOfTheSameTicketProduceExactlyOneValidEntry`, `…manualCheckinAndScannerRacingStillAdmitOnlyOnce` |
| QR adulterado, QR/código anteriores à transferência, outro evento, cancelado | `…forgedReplacedForeignAndCancelledTicketsAreInvalid` |
| Check-in manual, reversão auditada, evento inativo `409` | `…checkinRequiresAnActiveEventAndCanBeUndoneByAManager` |
| Migrações aplicadas, restrições e índices | `MigrationsAndContractIntegrationTest.allMigrationsAreAppliedAndKeyConstraintsExist` |
| Contrato JSON = tipos do frontend; OpenAPI documenta o painel | `…organizerResponsesMatchTheFrontendTypes` |
| Limite de requisições, checagem de produção, regras de permissão e webhook | `RateLimitFilterTest`, `ProductionSafetyCheckTest`, `OrgRulesTest` |
| Partes 1 e 2 (venda sem duplicidade, idempotência, webhooks de pagamento, SSE, outbox) | `ReservationsIntegrationTest`, `OrdersIntegrationTest`, `TicketsIntegrationTest`, `SeatStreamIntegrationTest`, `OutboxKafkaIntegrationTest`, `Auth*`, `Catalog*` |

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | — | `dev` (local, demonstração, sandbox) · `prod` (produção) · `test` (testes) |
| `TF_DB_URL` / `TF_DB_USER` / `TF_DB_PASSWORD` | — | Conexão JDBC com o PostgreSQL. `TF_DB_POOL_SIZE` (prod, padrão 20) |
| `TF_REDIS_HOST` / `TF_REDIS_PORT` / `TF_REDIS_PASSWORD` | `localhost` / `6379` / — | Pub/sub do SSE, limitador de login e de requisições |
| `TF_KAFKA_BOOTSTRAP` | `localhost:9092` | Brokers Kafka (outbox → eventos de negócio) |
| `TF_JWT_SECRET` | *(vazio)* | HS256, **≥ 32 bytes**. Vazio = chave efêmera (só dev; `prod` recusa subir) |
| `TF_QR_SECRET` | *(vazio)* | HMAC dos QR Codes, **≥ 32 bytes**. Trocar invalida os QR emitidos |
| `TF_WEBHOOK_SECRET` | *(vazio)* | HMAC dos webhooks do gateway. Vazio = todos recusados |
| `TF_COOKIE_SECURE` | `true` | `Secure` no cookie do refresh. `false` só em `http://localhost` |
| `TF_CORS_ORIGINS` / `TF_APP_URL` | `http://localhost:5173` | Origens do frontend (lista separada por vírgula) / base dos links de e-mail |
| `TF_SWAGGER_ENABLED` | `true` (dev) · `false` (prod) | Swagger UI e `/api/docs` |
| `TF_RATE_LIMIT_ENABLED` | `true` | Limite por IP/min. Ajustes: `TF_RATE_LIMIT_GENERAL` (300), `_AUTH` (30), `_CHECKIN` (240), `_WEBHOOK` (600) |
| `TF_TRUSTED_PROXIES` | faixas privadas | `prod`: regex dos proxies cujo `X-Forwarded-For` é confiável |
| `TF_DEMO_PASSWORD` | `Demo12345` (dev) | Senha das contas de demonstração; vazio = não cria |
| `PORT` | `8080` | Porta HTTP |
| `TF_DB_PORT`, `TF_REDIS_PORT`, `TF_KAFKA_PORT`, `TF_API_PORT` | 5432, 6379, 29092, 8080 | Só docker-compose: portas no host |

Ajustes finos em `application.yml` (`tf.sales.*`, `tf.jobs.*`, `tf.redis.enabled`, `tf.kafka.enabled`).

## Produção (`SPRING_PROFILES_ACTIVE=prod`)

`ProductionSafetyCheck` **recusa subir** se: perfis `dev`/`test` ativos junto (habilitariam o sandbox e `/api/dev/**`), segredos JWT/QR
com menos de 32 bytes, cookie sem `Secure`, tokens expostos no corpo, semente de demonstração ligada, `TF_CORS_ORIGINS` com `*`,
`http://` ou `localhost`, senha do banco vazia ou limitador desligado. Além disso o perfil:
* logs em **JSON (ECS)** com `requestId` em cada linha; Swagger desligado; desligamento gracioso;
* `server.forward-headers-strategy=native` — só confia em `X-Forwarded-*` de proxies internos (IP real para limitador e auditoria);
* sem gateway real, pagamentos respondem `503 PAYMENT_PROVIDER_UNAVAILABLE` (nunca finge cobrar).

## Arquitetura do painel (Parte 3)

```
org/access    OrgContext (organização + papel, resolvidos no BANCO a cada requisição), OrgPermission, auditoria, avisos
org/events    eventos (rascunho → publicação → catálogo), lotes, mapa do editor ↔ assentos de venda, cancelamento
org/orders    pedidos (filtros/paginação em SQL), reembolso pelo organizador
org/checkin   portaria (UPDATE atômico condicional), participantes
org/reports   dashboard e relatórios (agregações no PostgreSQL)
org/settings  organização, equipe, webhooks, avisos, busca
org/web       controllers finos + DTOs (= src/types/organizer.ts)
security      RateLimitFilter, RequestLoggingFilter (X-Request-Id), cabeçalhos/CSP, CORS
```

* **Isolamento:** todo serviço recebe `OrgContext` e toda consulta tem `organization_id = :org` (JPQL ou SQL). Recurso de outra
  organização = `404`. O `X-Organization-Id` do cliente só escolhe entre organizações das quais a pessoa é membro.
* **Check-in atômico:** `UPDATE tickets SET status='USED' … WHERE id=? AND status='VALID' AND qr_version=?` — a linha do ingresso
  serializa leituras simultâneas; 1 linha alterada = `valid`, 0 = relê e responde `used`/`invalid`. `ck_tickets_used` garante que
  `USED` sempre tem horário.
* **Mapa com vendas:** evento + todos os assentos travados (ordem de id, a mesma dos compradores — sem deadlock); assento vendido
  ou com reserva ativa não muda (`409 SEAT_SOLD`); `ck_seats_blocked` impede bloqueio de assento reservado/vendido.
* **Despublicar/cancelar:** os lotes saem de venda com um `UPDATE` que espera reservas em andamento; depois as reservas ativas são
  liberadas e os pedidos pendentes/pagos expirados/reembolsados, tudo na mesma transação.
* **Relatórios:** só agregações sobre pedidos, ingressos, reservas e lotes reais. Funil sem "visitas" (não há analytics).

As garantias das Partes 1 e 2 (PostgreSQL como fonte da verdade, `SELECT … FOR UPDATE` ordenado nos assentos, estoque por `UPDATE`
condicional, idempotência persistente, outbox → Kafka, SSE pós-commit via Redis, webhooks HMAC com anti-replay) continuam valendo —
detalhes em `docs/API-CONTRACTS.md` §11.

## Segurança

* Autenticação: JWT HS256 (15 min) + refresh token rotativo em cookie `HttpOnly`/`SameSite=Lax`/`Path=/api/auth` (hash no banco,
  reuso derruba a família); BCrypt(12); bloqueio após 5 falhas de login; recuperação de senha de uso único.
* Autorização: papel no filtro + vínculo e papel de membro no serviço (§12.1 do contrato); papel revogado vale na hora.
* Cartão: o servidor **não recebe** número/CVV (422 antes de qualquer gravação). Pagamentos/estornos com chave de idempotência.
* QR: HMAC-SHA256 + versão; na transferência a versão **e o código digitável** mudam.
* Limite de requisições por IP (Redis), CORS restrito, CSP/HSTS/X-Frame-Options, `X-Request-Id`, log de acesso sem query string,
  auditoria das ações administrativas, mensagens de erro sem detalhes internos (`ref` para correlação).
* Webhooks de organização: só HTTPS público (proteção básica contra SSRF no cadastro); segredo gerado e nunca devolvido.

## Integrações externas pendentes

| Integração | Situação | O que falta |
|---|---|---|
| Gateway de pagamento (cartão, Pix, boleto, estorno) | Só **sandbox** (dev/test) | Implementar `PaymentProvider` real, SDK de tokenização no frontend, segredo/URL de webhook |
| Cofre de cartões (`/me/cards`) | `503 CARD_VAULT_UNAVAILABLE` | Vault do gateway |
| E-mail (recuperação de senha, notificações ao comprador) | Só log (`LoggingNotificationSender`) | Provedor SMTP/SES |
| Entrega de webhooks da organização | Cadastro pronto; **não envia** | Consumidor Kafka → HTTP assinado (HMAC com o segredo gerado), revalidar IP resolvido (SSRF), retentativas |
| Upload de capa | Só o nome do arquivo (`coverName`) | URL pré-assinada + CDN; `coverUrl` segue `null` |
| Analytics de visitas | Não existe | Funil visita → compra |

## Pendências para produção

* Gateway real e o SDK de tokenização no frontend (hoje o frontend gera o token **sandbox** `tok_<final>` — só funciona em dev/test).
* Reembolsos em massa (cancelamento de evento) chamam o gateway dentro da transação: com um gateway real, mover para processamento
  assíncrono (fila) com retentativas — hoje uma falha do gateway desfaz o cancelamento inteiro (seguro, mas não escala).
* Verificação de e-mail no cadastro (pré-requisito para convites de equipe por e-mail e transferências a quem não tem conta).
* Access token em memória no frontend (hoje em `localStorage`, como nos mocks) e CSP no frontend.
* `perCustomerLimit` do lote entre pedidos; janela de horário do check-in; reconciliação periódica com o gateway.
* Observabilidade: métricas (Micrometer/Prometheus), tracing, alertas; health de Kafka (o relay do outbox tolera Kafka fora do ar).
* Redis/Kafka gerenciados com TLS e autenticação; backups e política de retenção de `audit_log`/`checkin_scans`.

## Limitações conhecidas

* A jornada de compra desenha o mapa como grade retangular: vãos e bloqueios aparecem como indisponíveis; numeração fora da posição
  ou fileiras com setores misturados são exibidas de forma aproximada (§12.3).
* Eventos de demonstração têm vendas iniciais nos lotes sem pedidos (afeta `byLot` desses eventos, não os criados pelo painel).
* Sem MFA; sem endpoint de administração da plataforma (`/api/admin/**` é só protegido).
* Pedido pendente (Pix 30 min, boleto 3 dias) mantém assentos/estoque segurados até o prazo.

## Estrutura

```
backend/src/main/java/br/com/ticketflow
├── auth/  catalog/  sales/  orders/  tickets/  payment/  idempotency/  outbox/  realtime/   (Partes 1 e 2)
├── org/           painel do organizador (Parte 3) — ver "Arquitetura do painel"
├── organization/  organizações e membros · user/ perfil (GET/PATCH /me) · security/ · config/ · shared/port/ · common/
backend/src/main/resources/db/migration
   V1 identidade · V2 catálogo · V3 dados de referência · V4 vendas/pedidos/ingressos/outbox · V5 painel do organizador
```
