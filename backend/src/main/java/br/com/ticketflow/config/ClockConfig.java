package br.com.ticketflow.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ClockConfig {

    /** Relógio injetável (facilita testar expiração e filtros por data). */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
