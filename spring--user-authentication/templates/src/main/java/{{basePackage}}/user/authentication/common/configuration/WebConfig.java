package {{basePackage}}.user.authentication.common.configuration;

import {{basePackage}}.user.authentication.common.interceptor.AccessTokenHandlerInterceptor;
import {{basePackage}}.user.authentication.common.resolver.RequestUserArgumentResolver;
import lombok.NonNull;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

/**
 * Registers the JWT access-token interceptor and the {@code @RequestUser} argument resolver.
 * <p>
 * Controllers then receive the payload as a method argument, e.g.
 * {@code @RequestUser AccessTokenPayload payload}, without reading the Authorization header.
 */
public class WebConfig implements WebMvcConfigurer {

//region Variable

    private final AccessTokenHandlerInterceptor accessTokenInterceptor;
    private final RequestUserArgumentResolver requestUserArgumentResolver;

//endregion

//region Constructor

    public WebConfig(
            AccessTokenHandlerInterceptor accessTokenInterceptor,
            RequestUserArgumentResolver requestUserArgumentResolver
    ) {
        this.accessTokenInterceptor = accessTokenInterceptor;
        this.requestUserArgumentResolver = requestUserArgumentResolver;
    }

//endregion

//region Configuration

    @Override
    public void addInterceptors(@NonNull InterceptorRegistry registry) {
        registry.addInterceptor(this.accessTokenInterceptor).addPathPatterns("/**");
    }

    /**
     * Enables {@code @RequestUser AccessTokenPayload} injection on controller methods.
     */
    @Override
    public void addArgumentResolvers(@NonNull List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(this.requestUserArgumentResolver);
    }

//endregion

}
