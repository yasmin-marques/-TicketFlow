package br.com.ticketflow.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Correlação e log de acesso: cada requisição recebe um {@code X-Request-Id} (o do proxy, se for seguro, ou um novo),
 * que vai para o MDC ({@code requestId} — sai nos logs estruturados) e para a resposta. A linha de acesso registra
 * método, caminho SEM query string (tokens como {@code ?access_token=} nunca vão para o log), status e duração.
 */
public class RequestLoggingFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Request-Id";
    private static final Logger access = LoggerFactory.getLogger("br.com.ticketflow.access");
    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9._-]{8,64}$");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String incoming = request.getHeader(HEADER);
        String requestId = incoming != null && SAFE_ID.matcher(incoming).matches() ? incoming : UUID.randomUUID().toString();
        long start = System.nanoTime();
        MDC.put("requestId", requestId);
        response.setHeader(HEADER, requestId);
        try {
            chain.doFilter(request, response);
        } finally {
            long ms = (System.nanoTime() - start) / 1_000_000;
            if (!request.getRequestURI().startsWith("/actuator/health")) {
                access.info("{} {} {} {}ms", request.getMethod(), request.getRequestURI(), response.getStatus(), ms);
            }
            MDC.remove("requestId");
        }
    }
}
