-- Catálogo: categorias, locais, eventos, programação, política, tipos de ingresso e lotes.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE categories (
    id         SMALLINT    PRIMARY KEY,
    slug       VARCHAR(40) NOT NULL UNIQUE,
    name       VARCHAR(60) NOT NULL,
    sort_order SMALLINT    NOT NULL DEFAULT 0
);

CREATE TABLE venues (
    id         UUID         PRIMARY KEY,
    name       VARCHAR(160) NOT NULL,
    address    VARCHAR(200),
    district   VARCHAR(120),
    city       VARCHAR(80)  NOT NULL,
    state      CHAR(2)      NOT NULL,
    notes      VARCHAR(400),
    latitude   NUMERIC(9, 6),
    longitude  NUMERIC(9, 6),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_venues_lat CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT ck_venues_lng CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT ck_venues_geo_pair CHECK ((latitude IS NULL) = (longitude IS NULL))
);
CREATE INDEX ix_venues_city ON venues (city, state);

CREATE TABLE events (
    id               UUID          PRIMARY KEY,
    organization_id  UUID          NOT NULL REFERENCES organizations (id),
    category_id      SMALLINT      NOT NULL REFERENCES categories (id),
    venue_id         UUID          NOT NULL REFERENCES venues (id),
    slug             VARCHAR(120)  NOT NULL UNIQUE,
    title            VARCHAR(160)  NOT NULL,
    subtitle         VARCHAR(80),
    description      TEXT,
    age_rating       SMALLINT,
    starts_at        TIMESTAMPTZ   NOT NULL,
    ends_at          TIMESTAMPTZ,
    status           VARCHAR(20)   NOT NULL DEFAULT 'DRAFT',
    published_at     TIMESTAMPTZ,
    featured         BOOLEAN       NOT NULL DEFAULT FALSE,
    featured_rank    SMALLINT,
    has_seat_map     BOOLEAN       NOT NULL DEFAULT FALSE,
    service_fee_pct  NUMERIC(4, 1) NOT NULL DEFAULT 10.0,
    cover_url        VARCHAR(500),
    -- Denormalizados a partir dos lotes (recalculados por EventAvailabilityService):
    min_price_cents  BIGINT,
    sold_out         BOOLEAN       NOT NULL DEFAULT FALSE,
    last_tickets     BOOLEAN       NOT NULL DEFAULT FALSE,
    -- Texto normalizado (sem acentos, minúsculo) para busca tolerante.
    search_text      TEXT          NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    version          BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ck_events_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'ENDED', 'CANCELLED')),
    CONSTRAINT ck_events_period CHECK (ends_at IS NULL OR ends_at > starts_at),
    CONSTRAINT ck_events_age CHECK (age_rating IS NULL OR age_rating BETWEEN 0 AND 21),
    CONSTRAINT ck_events_fee CHECK (service_fee_pct >= 0 AND service_fee_pct <= 50),
    CONSTRAINT ck_events_min_price CHECK (min_price_cents IS NULL OR min_price_cents >= 0),
    CONSTRAINT ck_events_published CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL)
);
CREATE INDEX ix_events_status_start ON events (status, starts_at);
CREATE INDEX ix_events_category ON events (category_id, starts_at);
CREATE INDEX ix_events_venue ON events (venue_id);
CREATE INDEX ix_events_org ON events (organization_id);
CREATE INDEX ix_events_featured ON events (featured_rank) WHERE featured;
CREATE INDEX ix_events_search_trgm ON events USING gin (search_text gin_trgm_ops);

CREATE TABLE event_schedule_items (
    id         UUID         PRIMARY KEY,
    event_id   UUID         NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    position   SMALLINT     NOT NULL,
    time_label VARCHAR(5)   NOT NULL,
    title      VARCHAR(160) NOT NULL,
    location   VARCHAR(120),
    UNIQUE (event_id, position)
);

CREATE TABLE event_policy_items (
    id       UUID         PRIMARY KEY,
    event_id UUID         NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    position SMALLINT     NOT NULL,
    title    VARCHAR(160) NOT NULL,
    body     TEXT         NOT NULL,
    UNIQUE (event_id, position)
);

CREATE TABLE ticket_types (
    id          UUID         PRIMARY KEY,
    event_id    UUID         NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    code        VARCHAR(40)  NOT NULL,
    name        VARCHAR(80)  NOT NULL,
    description VARCHAR(200),
    kind        VARCHAR(10)  NOT NULL,
    sector_code VARCHAR(40),
    position    SMALLINT     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (event_id, code),
    CONSTRAINT ck_ticket_types_kind CHECK (kind IN ('GENERAL', 'SEATED')),
    CONSTRAINT ck_ticket_types_sector CHECK (kind = 'SEATED' OR sector_code IS NULL)
);
CREATE INDEX ix_ticket_types_event ON ticket_types (event_id, position);

CREATE TABLE ticket_lots (
    id                 UUID        PRIMARY KEY,
    ticket_type_id     UUID        NOT NULL REFERENCES ticket_types (id) ON DELETE CASCADE,
    name               VARCHAR(60) NOT NULL,
    price_cents        BIGINT      NOT NULL,
    quantity_total     INTEGER     NOT NULL,
    quantity_sold      INTEGER     NOT NULL DEFAULT 0,
    sales_start        TIMESTAMPTZ NOT NULL,
    sales_end          TIMESTAMPTZ NOT NULL,
    status             VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    per_customer_limit SMALLINT    NOT NULL DEFAULT 6,
    auto_open_next     BOOLEAN     NOT NULL DEFAULT TRUE,
    position           SMALLINT    NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    version            BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT ck_lots_price CHECK (price_cents >= 0),
    CONSTRAINT ck_lots_quantity CHECK (quantity_total > 0),
    CONSTRAINT ck_lots_sold CHECK (quantity_sold >= 0 AND quantity_sold <= quantity_total),
    CONSTRAINT ck_lots_window CHECK (sales_end > sales_start),
    CONSTRAINT ck_lots_status CHECK (status IN ('DRAFT', 'PUBLISHED')),
    CONSTRAINT ck_lots_limit CHECK (per_customer_limit BETWEEN 1 AND 20)
);
CREATE INDEX ix_ticket_lots_type ON ticket_lots (ticket_type_id, position);
