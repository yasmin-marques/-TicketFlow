-- Identidade: usuários, papéis, permissões e tokens de sessão/recuperação.
-- As migrations são a fonte de verdade do schema (hibernate.ddl-auto=validate).

CREATE TABLE roles (
    id   SMALLINT    PRIMARY KEY,
    name VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE permissions (
    id          SMALLINT     PRIMARY KEY,
    code        VARCHAR(60)  NOT NULL UNIQUE,
    description VARCHAR(200) NOT NULL
);

CREATE TABLE role_permissions (
    role_id       SMALLINT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission_id SMALLINT NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id                      UUID         PRIMARY KEY,
    email                   VARCHAR(254) NOT NULL,
    name                    VARCHAR(120) NOT NULL,
    password_hash           VARCHAR(100) NOT NULL,
    phone                   VARCHAR(20),
    cpf                     VARCHAR(14),
    birth_date              DATE,
    notify_order_updates    BOOLEAN      NOT NULL DEFAULT TRUE,
    notify_event_reminders  BOOLEAN      NOT NULL DEFAULT TRUE,
    notify_marketing        BOOLEAN      NOT NULL DEFAULT FALSE,
    enabled                 BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version                 BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_users_email_format CHECK (position('@' IN email) > 1)
);
-- E-mail único sem diferenciar maiúsculas de minúsculas.
CREATE UNIQUE INDEX ux_users_email_lower ON users (lower(email));

CREATE TABLE user_roles (
    user_id UUID     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id SMALLINT NOT NULL REFERENCES roles (id),
    PRIMARY KEY (user_id, role_id)
);
CREATE INDEX ix_user_roles_role ON user_roles (role_id);

-- Refresh tokens: só o hash SHA-256 é guardado. `family_id` agrupa a cadeia de rotação;
-- reutilizar um token já revogado derruba a família inteira.
CREATE TABLE refresh_tokens (
    id          UUID        PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    family_id   UUID        NOT NULL,
    token_hash  CHAR(64)    NOT NULL UNIQUE,
    issued_at   TIMESTAMPTZ NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    replaced_by UUID,
    user_agent  VARCHAR(200),
    ip_address  VARCHAR(45),
    CONSTRAINT ck_refresh_expiry CHECK (expires_at > issued_at)
);
CREATE INDEX ix_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX ix_refresh_tokens_family ON refresh_tokens (family_id);
CREATE INDEX ix_refresh_tokens_expires ON refresh_tokens (expires_at);

-- Recuperação de senha: token aleatório de uso único (só o hash é guardado).
CREATE TABLE password_reset_tokens (
    id         UUID        PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash CHAR(64)    NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    CONSTRAINT ck_reset_expiry CHECK (expires_at > created_at)
);
CREATE INDEX ix_password_reset_user ON password_reset_tokens (user_id);

-- Organizações (produtoras) e seus membros.
CREATE TABLE organizations (
    id         UUID         PRIMARY KEY,
    name       VARCHAR(120) NOT NULL,
    slug       VARCHAR(120) NOT NULL UNIQUE,
    document   VARCHAR(18),
    email      VARCHAR(254),
    phone      VARCHAR(20),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version    BIGINT       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_organizations_name_lower ON organizations (lower(name));

CREATE TABLE organization_members (
    organization_id UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    member_role     VARCHAR(20) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id),
    CONSTRAINT ck_member_role CHECK (member_role IN ('OWNER', 'MANAGER', 'CHECKIN'))
);
CREATE INDEX ix_org_members_user ON organization_members (user_id);
