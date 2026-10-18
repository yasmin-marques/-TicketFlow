package br.com.ticketflow.support;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.lifecycle.Startables;

/** Infraestrutura real compartilhada por todos os testes de integração (um conjunto de contêineres por execução). */
public final class TestContainers {

    public static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");
    public static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
    public static final KafkaContainer KAFKA = new KafkaContainer("apache/kafka:3.8.0");

    static {
        Startables.deepStart(POSTGRES, REDIS, KAFKA).join();
    }

    private TestContainers() {}

    public static void register(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        registry.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
        registry.add("tf.security.bcrypt-strength", () -> 4);
        registry.add("tf.security.jwt.secret", () -> "test-secret-test-secret-test-secret-1234");
        registry.add("tf.security.refresh.cookie.secure", () -> false);
        registry.add("tf.seed.enabled", () -> false);
        registry.add("tf.payments.webhook-secret", () -> "whsec_test_secret_for_hmac_signatures_123456");
        registry.add("tf.tickets.qr-secret", () -> "qr-secret-qr-secret-qr-secret-qr-secret-1234");
        // Os testes controlam o tempo: a expiração roda sob demanda; o relay do outbox roda de verdade.
        registry.add("tf.jobs.expiry-enabled", () -> false);
    }
}
