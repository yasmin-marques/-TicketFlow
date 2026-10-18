package br.com.ticketflow.security;

import br.com.ticketflow.config.AppProperties;
import java.util.Collection;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Segurança da API: stateless, JWT Bearer (resource server) e autorização por papel no servidor.
 *
 * <p>Regras (a primeira que casar vence):
 * <ul>
 *   <li>público: {@code /api/auth/**}, catálogo (GET), documentação e health;</li>
 *   <li>{@code /api/org/**}: ORGANIZER ou ADMIN; {@code /api/admin/**}: ADMIN;</li>
 *   <li>qualquer outra rota {@code /api/**}: usuário autenticado (negar por padrão).</li>
 * </ul>
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain api(HttpSecurity http, SecurityErrorHandlers errors, Converter<Jwt, AbstractAuthenticationToken> jwtConverter)
            throws Exception {
        http.csrf(AbstractHttpConfigurer::disable) // API stateless com Bearer; o cookie de refresh é SameSite e só vale em /api/auth
                .cors(Customizer.withDefaults())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(h -> h.contentTypeOptions(Customizer.withDefaults())
                        .frameOptions(f -> f.deny())
                        .referrerPolicy(r -> r.policy(org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER)))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/api/auth/**").permitAll()
                        .requestMatchers(HttpMethod.GET,
                                "/api/events", "/api/events/featured", "/api/events/upcoming", "/api/events/suggest",
                                "/api/events/{slug}", "/api/events/{slug}/related", "/api/categories").permitAll()
                        // Venda pública: lotes, mapa e disponibilidade (o stream aceita ?access_token= porque EventSource não envia cabeçalhos)
                        .requestMatchers(HttpMethod.GET, "/api/events/*/sales", "/api/events/*/seats", "/api/events/*/seats/stream").permitAll()
                        // Webhooks do gateway: autenticados pela assinatura HMAC do corpo, não por JWT
                        .requestMatchers(HttpMethod.POST, "/api/webhooks/payments/*").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll()
                        .requestMatchers("/api/docs/**", "/api/swagger-ui.html", "/api/swagger-ui/**", "/v3/api-docs/**").permitAll()
                        .requestMatchers("/api/org/**").hasAnyRole("ORGANIZER", "ADMIN")
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().denyAll())
                .oauth2ResourceServer(o -> o
                        .authenticationEntryPoint(errors)
                        .accessDeniedHandler(errors)
                        .jwt(j -> j.jwtAuthenticationConverter(jwtConverter)))
                .exceptionHandling(e -> e.authenticationEntryPoint(errors).accessDeniedHandler(errors));
        return http.build();
    }

    @Bean
    PasswordEncoder passwordEncoder(AppProperties props) {
        return new BCryptPasswordEncoder(props.security().bcryptStrength());
    }

    /** Converte a claim {@code roles} do JWT em autoridades {@code ROLE_*}. */
    @Bean
    Converter<Jwt, AbstractAuthenticationToken> jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> {
            List<String> roles = jwt.getClaimAsStringList("roles");
            Collection<GrantedAuthority> authorities = roles == null
                    ? List.of()
                    : roles.stream().<GrantedAuthority>map(r -> new SimpleGrantedAuthority("ROLE_" + r)).toList();
            return authorities;
        });
        return converter;
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(AppProperties props) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(props.cors().allowedOrigins());
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept", "Idempotency-Key"));
        cors.setExposedHeaders(List.of("Retry-After"));
        cors.setAllowCredentials(true); // necessário para o cookie de refresh
        cors.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cors);
        return source;
    }
}
