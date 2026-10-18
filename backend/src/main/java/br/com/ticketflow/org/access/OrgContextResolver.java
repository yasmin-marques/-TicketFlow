package br.com.ticketflow.org.access;

import br.com.ticketflow.security.CurrentUser;
import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.MethodParameter;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Injeta {@link OrgContext} nos controllers do painel. A identidade vem do JWT validado; a organização e o papel,
 * do banco ({@link OrgAccessService}). O cabeçalho {@code X-Organization-Id} é apenas uma preferência do cliente.
 */
@Configuration
public class OrgContextResolver implements HandlerMethodArgumentResolver, WebMvcConfigurer {

    public static final String HEADER = "X-Organization-Id";

    private final OrgAccessService access;

    public OrgContextResolver(OrgAccessService access) {
        this.access = access;
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(this);
    }

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.getParameterType().equals(OrgContext.class);
    }

    @Override
    public OrgContext resolveArgument(MethodParameter parameter, ModelAndViewContainer mav, NativeWebRequest request,
                                      WebDataBinderFactory binderFactory) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        Jwt jwt = auth != null && auth.getPrincipal() instanceof Jwt j ? j : null;
        return access.resolve(CurrentUser.id(jwt), request.getHeader(HEADER));
    }
}
