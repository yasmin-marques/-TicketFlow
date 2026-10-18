-- Painel do organizador: gestão de eventos (rascunhos), mapa editável, check-in, auditoria, configurações e avisos.
-- Toda consulta do painel é filtrada por organization_id no servidor; os índices abaixo cobrem esses filtros.

-- ── Eventos: rascunhos podem existir sem local definido ─────────────────────────────────────────────────────
ALTER TABLE events ALTER COLUMN venue_id DROP NOT NULL;
ALTER TABLE events ADD COLUMN cancellation_policy VARCHAR(10) NOT NULL DEFAULT 'full-7d';
ALTER TABLE events ADD CONSTRAINT ck_events_policy CHECK (cancellation_policy IN ('full-7d', 'none'));
ALTER TABLE events ADD COLUMN cover_name VARCHAR(200);
-- Planta do editor (OrgSeatMap em JSON). Os assentos vendáveis continuam em event_seats (fonte da verdade da venda).
ALTER TABLE events ADD COLUMN seat_layout TEXT;
ALTER TABLE events ADD COLUMN cancelled_at TIMESTAMPTZ;
-- Publicado/encerrado exige local (o catálogo sempre junta o local); rascunho e cancelado podem não ter.
ALTER TABLE events ADD CONSTRAINT ck_events_published_venue CHECK (status IN ('DRAFT', 'CANCELLED') OR venue_id IS NOT NULL);
CREATE INDEX ix_events_org_status ON events (organization_id, status, starts_at);

-- Local de um rascunho pode estar incompleto; a publicação exige nome, cidade e UF.
ALTER TABLE venues ALTER COLUMN city DROP NOT NULL;
ALTER TABLE venues ALTER COLUMN state DROP NOT NULL;

-- ── Assentos bloqueados pelo organizador (não vendáveis; aparecem como indisponíveis ao comprador) ─────────────
ALTER TABLE event_seats ADD COLUMN blocked BOOLEAN NOT NULL DEFAULT FALSE;
-- Um assento bloqueado nunca está reservado nem vendido.
ALTER TABLE event_seats ADD CONSTRAINT ck_seats_blocked CHECK (NOT blocked OR status = 'AVAILABLE');

-- ── Check-in ────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE tickets ADD COLUMN checked_in_gate VARCHAR(60);
ALTER TABLE tickets ADD COLUMN checked_in_by UUID REFERENCES users (id);
-- USED sempre tem horário; os demais nunca.
ALTER TABLE tickets ADD CONSTRAINT ck_tickets_used CHECK ((status = 'USED') = (used_at IS NOT NULL));
CREATE INDEX ix_tickets_event_status ON tickets (event_id, status);
CREATE INDEX ix_tickets_order ON tickets (order_id);

CREATE INDEX ix_orders_event_created ON orders (event_id, created_at DESC);
CREATE INDEX ix_orders_event_paid ON orders (event_id, paid_at) WHERE status = 'PAID';
CREATE INDEX ix_reservations_event ON reservations (event_id, created_at);

-- Toda leitura da portaria (válida, já usada ou inválida) — base das estatísticas e da auditoria do check-in.
CREATE TABLE checkin_scans (
    id          UUID         PRIMARY KEY,
    event_id    UUID         NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    ticket_id   UUID         REFERENCES tickets (id),
    code        VARCHAR(40)  NOT NULL,
    result      VARCHAR(10)  NOT NULL,
    gate        VARCHAR(60)  NOT NULL,
    holder_name VARCHAR(120),
    operator_id UUID         REFERENCES users (id),
    created_at  TIMESTAMPTZ  NOT NULL,
    CONSTRAINT ck_checkin_result CHECK (result IN ('valid', 'used', 'invalid', 'undone'))
);
CREATE INDEX ix_checkin_scans_event ON checkin_scans (event_id, created_at DESC);

-- ── Auditoria das ações administrativas ─────────────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
    id              UUID         PRIMARY KEY,
    organization_id UUID         REFERENCES organizations (id) ON DELETE SET NULL,
    actor_user_id   UUID         REFERENCES users (id),
    action          VARCHAR(60)  NOT NULL,
    entity_type     VARCHAR(30)  NOT NULL,
    entity_id       VARCHAR(60),
    details         TEXT         NOT NULL DEFAULT '{}',
    ip_address      VARCHAR(45),
    created_at      TIMESTAMPTZ  NOT NULL
);
CREATE INDEX ix_audit_org ON audit_log (organization_id, created_at DESC);

-- ── Organização: conta de repasse, webhooks e avisos ────────────────────────────────────────────────────────
ALTER TABLE organizations ADD COLUMN payout_bank VARCHAR(60);
ALTER TABLE organizations ADD COLUMN payout_agency VARCHAR(10);
ALTER TABLE organizations ADD COLUMN payout_account VARCHAR(20);
ALTER TABLE organizations ADD COLUMN payout_holder VARCHAR(120);

CREATE TABLE org_webhooks (
    id              UUID         PRIMARY KEY,
    organization_id UUID         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    url             VARCHAR(500) NOT NULL,
    events          VARCHAR(300) NOT NULL,
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    -- Segredo para assinar as entregas (HMAC). Nunca é devolvido pela API de listagem.
    secret          VARCHAR(80)  NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL,
    CONSTRAINT ck_webhook_https CHECK (url LIKE 'https://%')
);
CREATE INDEX ix_org_webhooks_org ON org_webhooks (organization_id);

CREATE TABLE org_notifications (
    id              UUID         PRIMARY KEY,
    organization_id UUID         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    title           VARCHAR(160) NOT NULL,
    body            VARCHAR(500) NOT NULL,
    href            VARCHAR(200),
    created_at      TIMESTAMPTZ  NOT NULL
);
CREATE INDEX ix_org_notifications_org ON org_notifications (organization_id, created_at DESC);

-- Leitura por usuário (cada membro marca os seus avisos).
CREATE TABLE org_notification_reads (
    notification_id UUID        NOT NULL REFERENCES org_notifications (id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    read_at         TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (notification_id, user_id)
);
