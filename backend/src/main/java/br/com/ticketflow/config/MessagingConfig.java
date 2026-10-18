package br.com.ticketflow.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
public class MessagingConfig {

    /** Tópico único de eventos de negócio, particionado pelo id do agregado (ordem por pedido/reserva). */
    @Bean
    @ConditionalOnProperty(prefix = "tf.kafka", name = "enabled", havingValue = "true")
    NewTopic domainEventsTopic(AppProperties props) {
        return TopicBuilder.name(props.kafka().topic()).partitions(3).replicas(1).build();
    }
}
