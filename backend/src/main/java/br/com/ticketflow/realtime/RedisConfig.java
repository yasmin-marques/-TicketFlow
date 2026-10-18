package br.com.ticketflow.realtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

/** Assina o canal de atualizações de assento e as entrega às conexões SSE desta instância. */
@Configuration
@ConditionalOnProperty(prefix = "tf.redis", name = "enabled", havingValue = "true")
public class RedisConfig {

    private static final Logger log = LoggerFactory.getLogger(RedisConfig.class);

    @Bean
    RedisMessageListenerContainer seatUpdateListener(RedisConnectionFactory factory, SeatStreamRegistry registry, ObjectMapper mapper) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(factory);
        container.setRecoveryInterval(2_000L); // reconecta sozinho se o Redis cair
        container.addMessageListener((message, pattern) -> {
            try {
                registry.dispatch(mapper.readValue(message.getBody(), SeatUpdate.class));
            } catch (Exception e) {
                log.warn("Mensagem de assento inválida descartada: {}", e.toString());
            }
        }, new ChannelTopic(SeatUpdateBus.CHANNEL));
        return container;
    }
}
