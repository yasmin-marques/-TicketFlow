-- Núcleo transacional: assentos, reservas, pedidos, ingressos, idempotência, outbox.
-- O PostgreSQL é a fonte definitiva da verdade: as restrições abaixo impedem venda duplicada mesmo se
-- Redis/Kafka falharem ou um bug de aplicação passar pelas verificações de serviço.

-- ── Estoque: unidades temporariamente seguradas por reservas ativas ou pedidos pendentes ─────────────────────
ALTER TABLE ticket_lots ADD COLUMN quantity_held INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ticket_lots ADD CONSTRAINT ck_lots_held CHECK (quantity_held >= 0 AND quantity_sold + quantity_held <= quantity_total);

-- ── Mapa de assentos ────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE event_seat_maps (
    event_id      UUID        PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
    rows          VARCHAR(40) NOT NULL,
    seats_per_row SMALLINT    NOT NULL CHECK (seats_per_row BETWEEN 1 AND 99),
    aisle_after   SMALLINT    NOT NULL DEFAULT 0
);

CREATE TABLE event_seat_sectors (
    event_id       UUID        NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    code           VARCHAR(40) NOT NULL,
    name           VARCHAR(80) NOT NULL,
    ticket_type_id UUID        NOT NULL REFERENCES ticket_types (id) ON DELETE CASCADE,
    rows           VARCHAR(40) NOT NULL,
    PRIMARY KEY (event_id, code)
);

-- Reservas (definidas antes dos assentos, que referenciam a reserva que os segura).
CREATE TABLE reservations (
    id              UUID         PRIMARY KEY,
    user_id         UUID         NOT NULL REFERENCES users (id),
    event_id        UUID         NOT NULL REFERENCES events (id),
    status          VARCHAR(12)  NOT NULL,
    service_fee_pct NUMERIC(4,1) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL,
    expires_at      TIMESTAMPTZ  NOT NULL,
    closed_at       TIMESTAMPTZ,
    version         BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_reservations_status CHECK (status IN ('ACTIVE', 'EXPIRED', 'RELEASED', 'COMPLETED')),
    CONSTRAINT ck_reservations_window CHECK (expires_at > created_at)
);
-- No máximo uma reserva ativa por usuário ("criar uma reserva libera a anterior").
CREATE UNIQUE INDEX ux_reservations_one_active_per_user ON reservations (user_id) WHERE status = 'ACTIVE';
CREATE INDEX ix_reservations_expiry ON reservations (expires_at) WHERE status = 'ACTIVE';
CREATE INDEX ix_reservations_user ON reservations (user_id, created_at DESC);

CREATE TABLE reservation_items (
    id               UUID    PRIMARY KEY,
    reservation_id   UUID    NOT NULL REFERENCES reservations (id) ON DELETE CASCADE,
    ticket_type_id   UUID    NOT NULL REFERENCES ticket_types (id),
    lot_id           UUID    NOT NULL REFERENCES ticket_lots (id),
    quantity         INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents BIGINT  NOT NULL CHECK (unit_price_cents >= 0),
    unit_fee_cents   BIGINT  NOT NULL CHECK (unit_fee_cents >= 0),
    UNIQUE (reservation_id, ticket_type_id)
);
CREATE INDEX ix_reservation_items_lot ON reservation_items (lot_id);

CREATE TABLE event_seats (
    id             UUID        PRIMARY KEY,
    event_id       UUID        NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    code           VARCHAR(8)  NOT NULL,
    sector_code    VARCHAR(40) NOT NULL,
    row_label      VARCHAR(2)  NOT NULL,
    seat_number    SMALLINT    NOT NULL,
    accessible     BOOLEAN     NOT NULL DEFAULT FALSE,
    status         VARCHAR(10) NOT NULL DEFAULT 'AVAILABLE',
    reservation_id UUID        REFERENCES reservations (id),
    held_until     TIMESTAMPTZ,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, code),
    CONSTRAINT ck_seats_status CHECK (status IN ('AVAILABLE', 'RESERVED', 'SOLD')),
    -- Um assento reservado sempre tem dono e prazo; um disponível nunca tem dono.
    CONSTRAINT ck_seats_hold CHECK (
        (status = 'AVAILABLE' AND reservation_id IS NULL AND held_until IS NULL)
        OR (status = 'RESERVED' AND reservation_id IS NOT NULL AND held_until IS NOT NULL)
        OR (status = 'SOLD'))
);
CREATE INDEX ix_event_seats_event_status ON event_seats (event_id, status);
CREATE INDEX ix_event_seats_reservation ON event_seats (reservation_id) WHERE reservation_id IS NOT NULL;

-- ── Lista de espera ("avise-me") ────────────────────────────────────────────────────────────────────────────
CREATE TABLE waitlist_entries (
    id             UUID        PRIMARY KEY,
    user_id        UUID        NOT NULL REFERENCES users (id),
    ticket_type_id UUID        NOT NULL REFERENCES ticket_types (id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL,
    notified_at    TIMESTAMPTZ,
    UNIQUE (user_id, ticket_type_id)
);

-- ── Pedidos, pagamentos e ingressos ─────────────────────────────────────────────────────────────────────────
CREATE SEQUENCE order_code_seq START WITH 48214;

CREATE TABLE orders (
    id               UUID         PRIMARY KEY,
    code             VARCHAR(20)  NOT NULL UNIQUE,
    user_id          UUID         NOT NULL REFERENCES users (id),
    event_id         UUID         NOT NULL REFERENCES events (id),
    -- Uma reserva só vira pedido uma vez (barreira definitiva contra checkout duplicado).
    reservation_id   UUID         NOT NULL UNIQUE REFERENCES reservations (id),
    status           VARCHAR(12)  NOT NULL,
    payment_method   VARCHAR(10)  NOT NULL,
    provider         VARCHAR(30)  NOT NULL,
    provider_ref     VARCHAR(100),
    card_last4       VARCHAR(4),
    card_brand       VARCHAR(20),
    installments     SMALLINT,
    pix_code         TEXT,
    pix_expires_at   TIMESTAMPTZ,
    boleto_line      VARCHAR(120),
    boleto_due_at    TIMESTAMPTZ,
    expires_at       TIMESTAMPTZ,
    subtotal_cents   BIGINT       NOT NULL CHECK (subtotal_cents >= 0),
    fee_cents        BIGINT       NOT NULL CHECK (fee_cents >= 0),
    total_cents      BIGINT       NOT NULL CHECK (total_cents >= 0),
    buyer_name       VARCHAR(120) NOT NULL,
    buyer_email      VARCHAR(254) NOT NULL,
    buyer_phone      VARCHAR(30)  NOT NULL,
    buyer_cpf        VARCHAR(14)  NOT NULL,
    buyer_birth_date VARCHAR(10)  NOT NULL,
    holders_json     TEXT         NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ  NOT NULL,
    paid_at          TIMESTAMPTZ,
    refunded_at      TIMESTAMPTZ,
    version          BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_orders_status CHECK (status IN ('PENDING', 'PAID', 'REFUNDED', 'EXPIRED')),
    CONSTRAINT ck_orders_method CHECK (payment_method IN ('CARD', 'PIX', 'BOLETO'))
);
CREATE INDEX ix_orders_user ON orders (user_id, created_at DESC);
CREATE INDEX ix_orders_pending_expiry ON orders (expires_at) WHERE status = 'PENDING';
CREATE UNIQUE INDEX ux_orders_provider_ref ON orders (provider, provider_ref) WHERE provider_ref IS NOT NULL;

CREATE TABLE order_lines (
    id               UUID         PRIMARY KEY,
    order_id         UUID         NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    position         SMALLINT     NOT NULL,
    ticket_type_id   UUID         NOT NULL REFERENCES ticket_types (id),
    description      VARCHAR(200) NOT NULL,
    quantity         INTEGER      NOT NULL CHECK (quantity > 0),
    unit_price_cents BIGINT       NOT NULL CHECK (unit_price_cents >= 0),
    seat_codes       VARCHAR(400) NOT NULL DEFAULT ''
);
CREATE INDEX ix_order_lines_order ON order_lines (order_id, position);

CREATE TABLE tickets (
    id             UUID         PRIMARY KEY,
    code           VARCHAR(20)  NOT NULL UNIQUE,
    order_id       UUID         NOT NULL REFERENCES orders (id),
    event_id       UUID         NOT NULL REFERENCES events (id),
    ticket_type_id UUID         NOT NULL REFERENCES ticket_types (id),
    slot           VARCHAR(60)  NOT NULL,
    seat_id        UUID         REFERENCES event_seats (id),
    holder_name    VARCHAR(120) NOT NULL,
    owner_user_id  UUID         REFERENCES users (id),
    transfer_email VARCHAR(254),
    status         VARCHAR(12)  NOT NULL DEFAULT 'VALID',
    qr_version     INTEGER      NOT NULL DEFAULT 1,
    used_at        TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL,
    version        BIGINT       NOT NULL DEFAULT 0,
    -- Emissão idempotente: um ingresso por posição do pedido.
    UNIQUE (order_id, slot),
    CONSTRAINT ck_tickets_status CHECK (status IN ('VALID', 'USED', 'CANCELLED')),
    CONSTRAINT ck_tickets_owner CHECK (owner_user_id IS NOT NULL OR transfer_email IS NOT NULL)
);
-- Um assento nunca tem dois ingressos ativos.
CREATE UNIQUE INDEX ux_tickets_active_seat ON tickets (seat_id) WHERE seat_id IS NOT NULL AND status <> 'CANCELLED';
CREATE INDEX ix_tickets_owner ON tickets (owner_user_id);
CREATE INDEX ix_tickets_transfer_email ON tickets (lower(transfer_email)) WHERE transfer_email IS NOT NULL;

CREATE TABLE ticket_transfers (
    id           UUID         PRIMARY KEY,
    ticket_id    UUID         NOT NULL REFERENCES tickets (id),
    from_user_id UUID         NOT NULL REFERENCES users (id),
    to_user_id   UUID         REFERENCES users (id),
    to_email     VARCHAR(254) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL
);
CREATE INDEX ix_ticket_transfers_ticket ON ticket_transfers (ticket_id);

-- ── Idempotência persistente ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE idempotency_keys (
    id              UUID         PRIMARY KEY,
    user_id         UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    idem_key        VARCHAR(120) NOT NULL,
    http_method     VARCHAR(10)  NOT NULL,
    path            VARCHAR(300) NOT NULL,
    request_hash    CHAR(64)     NOT NULL,
    status          VARCHAR(12)  NOT NULL,
    response_status SMALLINT,
    response_body   TEXT,
    created_at      TIMESTAMPTZ  NOT NULL,
    completed_at    TIMESTAMPTZ,
    UNIQUE (user_id, idem_key),
    CONSTRAINT ck_idem_status CHECK (status IN ('IN_PROGRESS', 'COMPLETED'))
);
CREATE INDEX ix_idempotency_created ON idempotency_keys (created_at);

-- ── Webhooks de pagamento: proteção contra repetição ────────────────────────────────────────────────────────
CREATE TABLE payment_webhook_events (
    provider    VARCHAR(30)  NOT NULL,
    event_id    VARCHAR(120) NOT NULL,
    event_type  VARCHAR(60)  NOT NULL,
    received_at TIMESTAMPTZ  NOT NULL,
    PRIMARY KEY (provider, event_id)
);

-- ── Transactional Outbox + consumidores idempotentes ────────────────────────────────────────────────────────
CREATE TABLE outbox_events (
    id             UUID         PRIMARY KEY,
    aggregate_type VARCHAR(40)  NOT NULL,
    aggregate_id   VARCHAR(60)  NOT NULL,
    event_type     VARCHAR(60)  NOT NULL,
    payload        TEXT         NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL,
    published_at   TIMESTAMPTZ,
    attempts       INTEGER      NOT NULL DEFAULT 0,
    last_error     VARCHAR(300)
);
CREATE INDEX ix_outbox_unpublished ON outbox_events (created_at) WHERE published_at IS NULL;

CREATE TABLE processed_events (
    consumer     VARCHAR(60) NOT NULL,
    event_id     UUID        NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (consumer, event_id)
);
