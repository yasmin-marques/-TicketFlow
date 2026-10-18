package br.com.ticketflow.support;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Base dos testes de integração: Spring completo + PostgreSQL, Redis e Kafka reais (Testcontainers) com as
 * migrations Flyway. Perfil {@code test} (habilita o provedor de pagamento sandbox). Custo de hash reduzido.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestBeans.class)
public abstract class AbstractIntegrationTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        TestContainers.register(registry);
    }

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected JdbcTemplate jdbc;

    /** Remove eventos e tudo que depende deles (reservas, pedidos, ingressos, assentos...). */
    protected void resetSalesData() {
        jdbc.execute("truncate table events cascade");
    }
}
