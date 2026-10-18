package br.com.ticketflow.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import br.com.ticketflow.support.SalesTestSupport;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

/** SSE com servidor HTTP real (e Redis pub/sub real entre a mudança e a entrega ao cliente). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
class SeatStreamIntegrationTest extends SalesTestSupport {

    @LocalServerPort private int port;
    @Autowired private SeatStreamRegistry registry;

    private final HttpClient client = HttpClient.newHttpClient();
    private final List<Stream<String>> open = new CopyOnWriteArrayList<>();
    private Fx fx;

    @BeforeEach
    void setUp() {
        resetSalesData();
        fx = newEvent(10);
    }

    @AfterEach
    void closeStreams() {
        open.forEach(Stream::close);
    }

    /** Conexão SSE aberta: as linhas recebidas vão para uma fila lida pelo teste. */
    private BlockingQueue<String> connect(String query, String... headers) throws Exception {
        HttpRequest.Builder req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/events/" + fx.eventId() + "/seats/stream" + query))
                .header("Accept", "text/event-stream");
        for (int i = 0; i < headers.length; i += 2) {
            req.header(headers[i], headers[i + 1]);
        }
        HttpResponse<Stream<String>> response = client.send(req.build(), HttpResponse.BodyHandlers.ofLines());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type").orElse("")).startsWith("text/event-stream");
        open.add(response.body());
        BlockingQueue<String> lines = new LinkedBlockingQueue<>();
        Thread reader = new Thread(() -> {
            try {
                response.body().forEach(lines::add);
            } catch (RuntimeException ignored) {
                // stream fechado pelo teste
            }
        });
        reader.setDaemon(true);
        reader.start();
        return lines;
    }

    /** Próxima mensagem {@code seat.updated} como "A01:reserved", ignorando comentários/ids. */
    private String nextUpdate(BlockingQueue<String> lines, long seconds) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds);
        boolean isSeatEvent = false;
        while (System.nanoTime() < deadline) {
            String line = lines.poll(200, TimeUnit.MILLISECONDS);
            if (line == null) {
                continue;
            }
            if (line.startsWith("event:")) {
                isSeatEvent = line.substring(6).trim().equals("seat.updated");
            } else if (line.startsWith("data:") && isSeatEvent) {
                var node = json.readTree(line.substring(5).trim());
                return node.path("seatId").asText() + ":" + node.path("status").asText();
            }
        }
        return null;
    }

    private String seatItem(String... seats) {
        // Fila A = setor premium; fila B = setor standard.
        String type = seats[0].startsWith("B") ? "standard" : "premium";
        return "[{\"ticketTypeId\":\"" + type + "\",\"quantity\":" + seats.length + ",\"seatIds\":["
                + String.join(",", java.util.Arrays.stream(seats).map(s -> "\"" + s + "\"").toList()) + "]}]";
    }

    @Test
    void connectedClientsReceiveSeatUpdatesInRealTimeWithoutPolling() throws Exception {
        BlockingQueue<String> watcher = connect("");
        Buyer a = newBuyer();

        Resp reserved = reserve(a, key(), reservationBody(fx, seatItem("A01", "A02")));
        assertThat(reserved.status()).isEqualTo(201);
        assertThat(List.of(nextUpdate(watcher, 10), nextUpdate(watcher, 5))).containsExactlyInAnyOrder("A01:reserved", "A02:reserved");

        // trocar a seleção solta um assento e segura outro
        setSeats(a, reserved.body().path("id").asText(), "premium", "[\"A02\",\"A03\"]");
        assertThat(List.of(nextUpdate(watcher, 10), nextUpdate(watcher, 5))).containsExactlyInAnyOrder("A01:available", "A03:reserved");

        // pagamento: vendido
        Resp paid = order(a, key(), orderBody(reserved.body().path("id").asText(), "card", "tok_4242"));
        assertThat(paid.status()).isEqualTo(201);
        assertThat(List.of(nextUpdate(watcher, 10), nextUpdate(watcher, 5))).containsExactlyInAnyOrder("A02:sold", "A03:sold");
    }

    @Test
    void expiryAndReleaseAreAnnouncedToo() throws Exception {
        BlockingQueue<String> watcher = connect("");
        Buyer a = newBuyer();
        String id = reserve(a, key(), reservationBody(fx, seatItem("B01"))).body().path("id").asText();
        assertThat(nextUpdate(watcher, 10)).isEqualTo("B01:reserved");

        release(a, id);
        assertThat(nextUpdate(watcher, 10)).isEqualTo("B01:available");
    }

    @Test
    void rolledBackChangesAreNeverAnnounced() throws Exception {
        BlockingQueue<String> watcher = connect("");
        Buyer a = newBuyer();
        Buyer b = newBuyer();
        reserve(a, key(), reservationBody(fx, seatItem("A01")));
        assertThat(nextUpdate(watcher, 10)).isEqualTo("A01:reserved");

        // B tenta A01+A02 e perde a disputa: a transação é desfeita e A02 NÃO pode aparecer como reservado.
        assertThat(reserve(b, key(), reservationBody(fx, seatItem("A01", "A02"))).status()).isEqualTo(409);
        assertThat(nextUpdate(watcher, 2)).isNull();
    }

    @Test
    void anAuthenticatedStreamDoesNotEchoTheUsersOwnActions() throws Exception {
        Buyer a = newBuyer();
        Buyer b = newBuyer();
        BlockingQueue<String> forA = connect("?access_token=" + a.token());

        reserve(a, key(), reservationBody(fx, seatItem("A01")));   // ação do próprio A: não é reenviada a ele
        reserve(b, key(), reservationBody(fx, seatItem("A02")));   // ação de B: A precisa saber

        assertThat(nextUpdate(forA, 10)).isEqualTo("A02:reserved");
        assertThat(nextUpdate(forA, 1)).isNull();
    }

    @Test
    void invalidTokensAreRejectedAndUnknownEventsAre404() throws Exception {
        HttpResponse<String> bad = client.send(HttpRequest.newBuilder(URI.create(
                "http://localhost:" + port + "/api/events/" + fx.eventId() + "/seats/stream?access_token=lixo")).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(bad.statusCode()).isEqualTo(401);
        HttpResponse<String> missing = client.send(HttpRequest.newBuilder(URI.create(
                "http://localhost:" + port + "/api/events/" + java.util.UUID.randomUUID() + "/seats/stream")).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(missing.statusCode()).isEqualTo(404);
    }

    @Test
    void reconnectingWithLastEventIdResendsTheFullSeatState() throws Exception {
        Buyer a = newBuyer();
        reserve(a, key(), reservationBody(fx, seatItem("A01")));

        BlockingQueue<String> reconnected = connect("", "Last-Event-ID", "12345");

        java.util.Map<String, String> state = new java.util.HashMap<>();
        for (int i = 0; i < 8; i++) {
            String update = nextUpdate(reconnected, 10);
            assertThat(update).isNotNull();
            state.put(update.split(":")[0], update.split(":")[1]);
        }
        assertThat(state).hasSize(8);
        assertThat(state.get("A01")).isEqualTo("reserved");
        assertThat(state.get("A02")).isEqualTo("available");
    }

    @Test
    void closedConnectionsAreCleanedUp() throws Exception {
        int before = registry.connectionCount();
        BlockingQueue<String> lines = connect("");
        await().atMost(Duration.ofSeconds(5)).until(() -> registry.connectionCount() == before + 1);

        open.forEach(Stream::close);
        // A desconexão é detectada na próxima escrita (atualização ou heartbeat).
        Buyer a = newBuyer();
        reserve(a, key(), reservationBody(fx, seatItem("A04")));
        await().atMost(Duration.ofSeconds(15)).until(() -> {
            registry.heartbeat();
            return registry.connectionCount() == before;
        });
        assertThat(lines).isNotNull();
    }

    @Test
    void seatsEndpointStillWorksForRecoveryAfterAMissedMessage() throws Exception {
        Buyer a = newBuyer();
        reserve(a, key(), reservationBody(fx, seatItem("B02")));
        var res = mvc.perform(get("/api/events/" + fx.eventId() + "/seats")).andReturn().getResponse();
        assertThat(json.readTree(res.getContentAsString()).path("seats").path("B02").asText()).isEqualTo("reserved");
    }

    @SuppressWarnings("unused")
    private static void ignore(IOException e) {}
}
