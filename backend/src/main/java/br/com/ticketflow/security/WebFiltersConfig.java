package br.com.ticketflow.security;

import br.com.ticketflow.config.AppProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.data.redis.core.StringRedisTemplate;

/** Filtros que rodam antes do Spring Security: correlação/log de acesso e limite de requisições. */
@Configuration
public class WebFiltersConfig {

    @Bean
    FilterRegistrationBean<RequestLoggingFilter> requestLoggingFilter() {
        FilterRegistrationBean<RequestLoggingFilter> reg = new FilterRegistrationBean<>(new RequestLoggingFilter());
        // Depois do ForwardedHeaderFilter (HIGHEST_PRECEDENCE), que resolve o IP real atrás do proxy.
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE + 1);
        return reg;
    }

    @Bean
    FilterRegistrationBean<RateLimitFilter> rateLimitFilter(AppProperties props, ObjectProvider<StringRedisTemplate> redis, ObjectMapper mapper,
                                                            Clock clock) {
        FilterRegistrationBean<RateLimitFilter> reg = new FilterRegistrationBean<>(
                new RateLimitFilter(props, redis.getIfAvailable(), mapper, clock));
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE + 2);
        reg.addUrlPatterns("/api/*");
        return reg;
    }
}
