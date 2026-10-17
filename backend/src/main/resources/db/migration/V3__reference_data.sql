-- Dados de referência (necessários em qualquer ambiente).

INSERT INTO roles (id, name) VALUES (1, 'USER'), (2, 'ORGANIZER'), (3, 'ADMIN');

INSERT INTO permissions (id, code, description) VALUES
    (1, 'catalog:read',        'Consultar o catálogo público'),
    (2, 'order:create',        'Reservar e comprar ingressos'),
    (3, 'ticket:read-own',     'Ver os próprios ingressos'),
    (4, 'event:manage',        'Criar e editar eventos da própria organização'),
    (5, 'order:read-org',      'Consultar pedidos da própria organização'),
    (6, 'checkin:perform',     'Realizar check-in na portaria'),
    (7, 'report:read-org',     'Ver relatórios da própria organização'),
    (8, 'admin:all',           'Administração da plataforma');

-- USER
INSERT INTO role_permissions (role_id, permission_id) VALUES (1, 1), (1, 2), (1, 3);
-- ORGANIZER = USER + gestão da organização
INSERT INTO role_permissions (role_id, permission_id) VALUES (2, 1), (2, 2), (2, 3), (2, 4), (2, 5), (2, 6), (2, 7);
-- ADMIN = tudo
INSERT INTO role_permissions (role_id, permission_id) SELECT 3, id FROM permissions;

INSERT INTO categories (id, slug, name, sort_order) VALUES
    (1, 'musica',      'Música',      1),
    (2, 'tecnologia',  'Tecnologia',  2),
    (3, 'esportes',    'Esportes',    3),
    (4, 'cultura',     'Cultura',     4),
    (5, 'gastronomia', 'Gastronomia', 5),
    (6, 'negocios',    'Negócios',    6);
