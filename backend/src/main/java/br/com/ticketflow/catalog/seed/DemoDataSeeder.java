package br.com.ticketflow.catalog.seed;

import br.com.ticketflow.catalog.domain.Category;
import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.domain.EventPolicyItem;
import br.com.ticketflow.catalog.domain.TicketKind;
import br.com.ticketflow.catalog.domain.TicketLot;
import br.com.ticketflow.catalog.domain.TicketType;
import br.com.ticketflow.catalog.domain.Venue;
import br.com.ticketflow.catalog.repository.CategoryRepository;
import br.com.ticketflow.catalog.repository.EventRepository;
import br.com.ticketflow.catalog.repository.VenueRepository;
import br.com.ticketflow.catalog.service.EventAvailabilityService;
import br.com.ticketflow.catalog.service.EventSearchTextBuilder;
import br.com.ticketflow.common.Texts;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.organization.Organization;
import br.com.ticketflow.organization.OrganizationRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Popula o catálogo com os mesmos eventos de demonstração do frontend (datas relativas a hoje), para que o
 * app funcione sem mocks. Só roda com {@code tf.seed.enabled=true} (perfil {@code dev}) e é idempotente:
 * nada é criado se já houver eventos.
 */
@Component
@ConditionalOnProperty(prefix = "tf.seed", name = "enabled", havingValue = "true")
public class DemoDataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);

    private static final double SP_LAT = -23.5505;
    private static final double SP_LNG = -46.6333;
    private static final Map<String, double[]> CITY_CENTERS = Map.of(
            "Rio de Janeiro", new double[] {-22.9068, -43.1729},
            "Belo Horizonte", new double[] {-19.9167, -43.9345},
            "Curitiba", new double[] {-25.4284, -49.2733});

    private enum Flag { NONE, LAST, SOLD_OUT }

    private record Row(String title, String cat, int days, String time, String venue, String city, String state,
                       Double km, long price, String org, Flag flag, boolean seats, boolean featured, Integer age,
                       String sub, String desc) {}

    private final EventRepository events;
    private final CategoryRepository categories;
    private final VenueRepository venues;
    private final OrganizationRepository organizations;
    private final EventAvailabilityService availability;
    private final Clock clock;
    private final ZoneId zone;

    public DemoDataSeeder(EventRepository events, CategoryRepository categories, VenueRepository venues,
                          OrganizationRepository organizations, EventAvailabilityService availability,
                          Clock clock, AppProperties props) {
        this.events = events;
        this.categories = categories;
        this.venues = venues;
        this.organizations = organizations;
        this.availability = availability;
        this.clock = clock;
        this.zone = ZoneId.of(props.catalog().timezone());
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (events.count() > 0) {
            return;
        }
        Instant now = clock.instant();
        Map<String, Category> cats = new HashMap<>();
        categories.findAll().forEach(c -> cats.put(c.getSlug(), c));
        Map<String, Organization> orgs = new HashMap<>();
        Map<String, Venue> venueCache = new HashMap<>();

        short featuredRank = 0;
        List<Row> rows = rows();
        int index = 0;
        for (Row r : rows) {
            Organization org = orgs.computeIfAbsent(r.org(), n -> organizations.save(Organization.create(n, Texts.slugify(n), now)));
            Venue venue = venueCache.computeIfAbsent(r.venue() + "|" + r.city(), k -> venues.save(venue(r, now)));
            Instant startsAt = startsAt(r);

            Event e = Event.create(org, cats.get(r.cat()), venue, Texts.slugify(r.title()), r.title(), startsAt, now);
            e.setSubtitle(r.sub());
            e.setDescription(r.desc());
            e.setAgeRating(r.age() == null ? null : r.age().shortValue());
            e.setEndsAt(startsAt.plusSeconds(4 * 3600));
            e.setHasSeatMap(r.seats());
            e.setServiceFeePct(new BigDecimal("10.0"));
            if (r.featured()) {
                e.setFeatured(true);
                e.setFeaturedRank(featuredRank++);
            }
            if (r.desc() != null) {
                e.addPolicyItem(EventPolicyItem.of(0, "Reembolso integral até 7 dias após a compra",
                        "Você pode cancelar a compra em até 7 dias e receber o valor integral, desde que o pedido seja feito com mais de 48 horas de antecedência do evento."));
                e.addPolicyItem(EventPolicyItem.of(1, "Cancelamento do evento pelo organizador",
                        "Se o evento for cancelado, o valor dos ingressos e a taxa de serviço são devolvidos integralmente, pelo mesmo meio de pagamento, em até 5 dias úteis."));
            }

            int total = 500;
            int sold = switch (r.flag()) {
                case SOLD_OUT -> total;
                case LAST -> total - 10;
                case NONE -> 100;
            };
            TicketType type = r.seats()
                    ? TicketType.of("standard", "Assento marcado", "Assento numerado", TicketKind.SEATED, "standard", 0, now)
                    : TicketType.of("geral", "Ingresso", "Acesso geral", TicketKind.GENERAL, null, 0, now);
            type.addLot(TicketLot.of("Lote único", r.price() * 100, total, sold, now.minusSeconds(30L * 86400),
                    startsAt, 0, now));
            e.addTicketType(type);

            availability.recalculate(e, now);
            // A ordem define "mais recentes": linhas posteriores são mais novas.
            Instant created = now.minusSeconds(3600L * (rows.size() - index));
            e.setCreatedAt(created);
            e.publish(created);
            index++;
            e.setSearchText(EventSearchTextBuilder.build(e));
            events.save(e);
        }
        log.info("Catálogo de demonstração criado: {} eventos.", rows.size());
    }

    private Venue venue(Row r, Instant now) {
        Venue v = Venue.create(r.venue(), r.city(), r.state(), now);
        if (r.km() != null) {
            // Aproxima a distância informada deslocando o local para o norte da origem.
            v.setLatitude(BigDecimal.valueOf(SP_LAT + r.km() / 111.0).setScale(6, java.math.RoundingMode.HALF_UP));
            v.setLongitude(BigDecimal.valueOf(SP_LNG).setScale(6, java.math.RoundingMode.HALF_UP));
        } else {
            double[] c = CITY_CENTERS.get(r.city());
            if (c != null) {
                v.setLatitude(BigDecimal.valueOf(c[0]).setScale(6, java.math.RoundingMode.HALF_UP));
                v.setLongitude(BigDecimal.valueOf(c[1]).setScale(6, java.math.RoundingMode.HALF_UP));
            }
        }
        return v;
    }

    private Instant startsAt(Row r) {
        LocalDate today = clock.instant().atZone(zone).toLocalDate();
        LocalDate date = switch (r.days()) {
            case -1 -> today.with(TemporalAdjusters.next(DayOfWeek.SATURDAY));
            case -2 -> today.with(TemporalAdjusters.next(DayOfWeek.SATURDAY)).plusDays(1);
            default -> today.plusDays(r.days());
        };
        Instant at = date.atTime(LocalTime.parse(r.time())).atZone(zone).toInstant();
        // "Hoje" às 23h pode já ter passado em horários tardios do dia; garante que o evento siga visível.
        Instant now = clock.instant();
        return at.isBefore(now) ? now.plusSeconds(3600) : at;
    }

    /** Dias: {@code -1} = próximo sábado, {@code -2} = próximo domingo. */
    private static List<Row> rows() {
        return List.of(
                r("Neon Horizon Festival", "musica", 8, "20:00", "Centro de Eventos", "São Paulo", "SP", 2.4, 80, "Pulse Produções", Flag.LAST, true, true, 18, "Festival", "Doze horas de música eletrônica, live acts e arte audiovisual em dois palcos."),
                r("DevSummit Brasil 2026", "tecnologia", 22, "09:00", "Expo Center Norte", "São Paulo", "SP", 6.1, 120, "DevSummit", Flag.LAST, false, true, 0, "Conferência", "Dois dias de palestras, workshops e networking sobre engenharia de software, IA aplicada e plataformas."),
                r("Clássico no Morumbi", "esportes", 30, "16:00", "Estádio do Morumbi", "São Paulo", "SP", 8.7, 60, "Liga Paulista", Flag.LAST, true, true, 0, "Futebol", "O maior clássico do estado com arquibancadas numeradas e setores a preços populares."),
                r("Noites de Jazz na Praça", "cultura", 13, "19:30", "Praça Roosevelt", "São Paulo", "SP", 3.3, 45, "Coletivo Praça Viva", Flag.NONE, true, true, 14, "Show", "Quartetos e big bands ocupam a praça numa série de noites ao ar livre."),
                r("Festival do Sabor", "gastronomia", 50, "12:00", "Parque Ibirapuera", "São Paulo", "SP", 5.0, 35, "Sabor & Cia", Flag.LAST, false, true, null, null, null),
                r("Growth Conference", "negocios", 57, "08:30", "Hotel Unique", "São Paulo", "SP", 4.2, 290, "Growth Hub", Flag.NONE, false, true, 16, "Conferência", "Casos reais de crescimento, vendas e produto contados por quem executou."),
                r("Rock na Fábrica", "musica", 3, "21:00", "Fábrica de Cultura", "São Paulo", "SP", 7.8, 55, "Rock Cia", Flag.NONE, false, false, 16, null, "Cinco bandas autorais num galpão industrial, com som de estádio e preço de bar."),
                r("Samba de Raiz no Bixiga", "musica", 0, "23:00", "Casa do Samba", "São Paulo", "SP", 1.9, 30, "Roda Viva", Flag.NONE, false, false, 18, null, "Roda de samba com repertório tradicional e convidados especiais até de madrugada."),
                r("Corrida Noturna 10K", "esportes", -1, "19:00", "Parque da Aclimação", "São Paulo", "SP", 3.9, 90, "Run SP", Flag.NONE, false, false, 0, null, "Percurso iluminado de 10 km com kit completo, medalha e hidratação em todo o trajeto."),
                r("Stand-up Night", "cultura", -2, "18:00", "Teatro Renault", "São Paulo", "SP", 6.6, 70, "Risada Livre", Flag.NONE, true, false, 16, null, "Cinco comediantes, uma noite: o melhor do stand-up nacional em formato de maratona."),
                r("Feira Gastronômica da Liberdade", "gastronomia", -1, "11:00", "Praça da Liberdade", "São Paulo", "SP", 2.1, 20, "Bairro Oriental", Flag.NONE, false, false, 0, null, "Barracas com culinária japonesa, coreana e chinesa, degustações e shows de taiko."),
                r("AI Builders Meetup", "tecnologia", 5, "19:00", "Cubo Coworking", "São Paulo", "SP", 4.8, 0, "AI Builders", Flag.NONE, false, false, 0, null, "Encontro gratuito para quem constrói produtos com IA: demos de 5 minutos e conversas abertas."),
                r("Final do Paulista de Vôlei", "esportes", 18, "15:00", "Ginásio do Ibirapuera", "São Paulo", "SP", 5.2, 40, "Federação Paulista", Flag.SOLD_OUT, true, false, 0, null, "Decisão do campeonato com ginásio lotado. Ingressos esgotados."),
                r("Exposição Luz e Sombra", "cultura", 9, "10:00", "MASP", "São Paulo", "SP", 3.0, 50, "MASP", Flag.NONE, false, false, 0, null, "Mostra com 120 obras sobre fotografia, contraste e a construção da imagem em preto e branco."),
                r("Pitch Day Startups", "negocios", 12, "14:00", "WeWork Faria Lima", "São Paulo", "SP", 6.9, 90, "Capital Semente", Flag.NONE, false, false, 18, null, "Vinte startups apresentam para investidores e para a plateia."),
                r("Noite do Vinho", "gastronomia", 20, "20:00", "Adega Vila Madalena", "São Paulo", "SP", 5.7, 150, "Confraria do Vinho", Flag.NONE, false, false, 18, null, "Degustação guiada de doze rótulos com harmonização e sommelier convidado."),
                r("Orquestra Sinfônica: Beethoven", "musica", 26, "20:30", "Sala São Paulo", "São Paulo", "SP", 4.4, 120, "Osesp", Flag.NONE, true, false, 0, null, "Sinfonias nº 5 e nº 7 sob regência convidada, em uma das melhores acústicas do país."),
                r("Hackathon Climate Tech", "tecnologia", 35, "09:00", "Insper", "São Paulo", "SP", 9.4, 25, "Climate Lab", Flag.NONE, false, false, 16, null, "Trinta e seis horas para prototipar soluções de dados e energia limpa, com mentoria."),
                r("Rio Sunset Festival", "musica", 15, "17:00", "Parque Olímpico", "Rio de Janeiro", "RJ", null, 220, "Sunset Co.", Flag.LAST, true, false, 18, null, "Pôr do sol, três palcos e line-up de música brasileira e eletrônica."),
                r("Meia Maratona do Rio", "esportes", 40, "06:00", "Aterro do Flamengo", "Rio de Janeiro", "RJ", null, 140, "Rio Corre", Flag.NONE, false, false, 0, null, "21 km com vista para a baía. Kit do atleta, chip de cronometragem e medalha."),
                r("Festival de Cinema Carioca", "cultura", 24, "18:00", "Cine Odeon", "Rio de Janeiro", "RJ", null, 30, "Cine Rio", Flag.NONE, false, false, 12, null, "Mostra competitiva de curtas e longas independentes com debates com diretores."),
                r("BH Tech Fest", "tecnologia", 28, "09:00", "Expominas", "Belo Horizonte", "MG", null, 180, "BH Digital", Flag.NONE, false, false, 0, null, "O maior encontro de tecnologia de Minas, com trilhas de dados, produto e infraestrutura."),
                r("Festival Comida de Buteco", "gastronomia", 11, "12:00", "Mercado Central", "Belo Horizonte", "MG", null, 25, "Buteco BH", Flag.NONE, false, false, 0, null, "Pratos autorais de botecos da cidade num só lugar, com votação do público."),
                r("Curitiba Jazz Sessions", "musica", 16, "20:00", "Ópera de Arame", "Curitiba", "PR", null, 85, "Jazz Sul", Flag.NONE, true, false, 12, null, "Noite de jazz sob a cobertura de vidro da Ópera de Arame."),
                r("Summit de Liderança", "negocios", 33, "08:00", "Expo Unimed", "Curitiba", "PR", null, 340, "Líderes do Sul", Flag.NONE, false, false, 18, null, "Um dia de palestras e mentorias com líderes de empresas de médio e grande porte."),
                r("Atletiba", "esportes", 21, "16:00", "Ligga Arena", "Curitiba", "PR", null, 70, "Federação Paranaense", Flag.LAST, true, false, 0, null, "O clássico paranaense numa arena de bolso: torcida colada ao gramado."));
    }

    private static Row r(String title, String cat, int days, String time, String venue, String city, String state,
                         Double km, long price, String org, Flag flag, boolean seats, boolean featured, Integer age,
                         String sub, String desc) {
        return new Row(title, cat, days, time, venue, city, state, km, price, org, flag, seats, featured, age, sub, desc);
    }
}
