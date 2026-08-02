package {{basePackage}}.user.authentication.common.resolver;

import {{basePackage}}.user.authentication.common.annotation.RequestUser;
import {{basePackage}}.user.authentication.common.authentication.jwt.payload.AccessTokenPayload;
import {{basePackage}}.user.authentication.common.interceptor.AccessTokenHandlerInterceptor;
import org.springframework.core.MethodParameter;
import org.springframework.lang.NonNull;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * Injects the validated JWT access-token payload into controller method parameters.
 * <p>
 * Pair with {@link RequestUser} on an {@link AccessTokenPayload} parameter. The payload is
 * produced by {@link AccessTokenHandlerInterceptor} and stored under
 * {@link AccessTokenHandlerInterceptor#AUTH_JWT_PAYLOAD_ATTR}.
 * <p>
 * Consumer controllers:
 * <pre>{@code
 * @AccessToken
 * @GetMapping("/me")
 * public APIResponseDTO<AccessTokenPayload> me(@RequestUser AccessTokenPayload payload) {
 *     return APIResponseDTO.success(payload);
 * }
 * }</pre>
 */
public class RequestUserArgumentResolver implements HandlerMethodArgumentResolver {

    /**
     * Supports parameters annotated with {@link RequestUser} whose type is
     * {@link AccessTokenPayload} (or a subclass).
     */
    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(RequestUser.class)
                && AccessTokenPayload.class.isAssignableFrom(parameter.getParameterType());
    }

    /**
     * Returns the request-scoped payload set by the access-token interceptor, or {@code null}
     * if the interceptor did not run / did not authenticate.
     */
    @Override
    public Object resolveArgument(
            @NonNull MethodParameter parameter,
            ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest,
            WebDataBinderFactory binderFactory
    ) {
        return webRequest.getAttribute(
                AccessTokenHandlerInterceptor.AUTH_JWT_PAYLOAD_ATTR,
                NativeWebRequest.SCOPE_REQUEST
        );
    }
}
