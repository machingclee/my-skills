package {{basePackage}}.user.authentication.common.configuration;

import {{basePackage}}.user.authentication.common.interceptor.AccessTokenHandlerInterceptor;
import {{basePackage}}.user.authentication.common.resolver.RequestUserArgumentResolver;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

public class WebConfig implements WebMvcConfigurer {

    private final AccessTokenHandlerInterceptor accessTokenInterceptor;
    private final RequestUserArgumentResolver requestUserArgumentResolver;

    public WebConfig(AccessTokenHandlerInterceptor accessTokenInterceptor,
                     RequestUserArgumentResolver requestUserArgumentResolver) {
        this.accessTokenInterceptor = accessTokenInterceptor;
        this.requestUserArgumentResolver = requestUserArgumentResolver;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(accessTokenInterceptor).addPathPatterns("/**");
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(requestUserArgumentResolver);
    }
}
