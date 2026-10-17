package br.com.ticketflow.support;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Base dos testes de integração: Spring completo + PostgreSQL real (Testcontainers, um contêiner por execução)
 * com as migrations Flyway. Custo de hash reduzido para manter os testes rápidos.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestBeans.class)
public abstract class AbstractIntegrationTest {

    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("tf.security.bcrypt-strength", () -> 4);
        registry.add("tf.security.jwt.secret", () -> "test-secret-test-secret-test-secret-1234");
        registry.add("tf.security.refresh.cookie.secure", () -> false);
        registry.add("tf.seed.enabled", () -> false);
    }

    @Autowired
    protected MockMvc mvc;
}
