package {{basePackage}}.user.authentication.common.annotation;

import {{basePackage}}.user.authentication.common.authentication.jwt.payload.AccessTokenPayload;
import {{basePackage}}.user.authentication.common.interceptor.AccessTokenHandlerInterceptor;
import {{basePackage}}.user.authentication.common.resolver.RequestUserArgumentResolver;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a controller method parameter to receive the validated JWT access-token payload.
 * <p>
 * The parameter type must be {@link AccessTokenPayload}. Resolution is handled by
 * {@link RequestUserArgumentResolver}, which reads the request attribute set by
 * {@link AccessTokenHandlerInterceptor}. The endpoint (or its controller class) must also
 * be annotated with {@code @AccessToken} so the interceptor runs first.
 * <p>
 * Example:
 * <pre>{@code
 * @AccessToken
 * @PutMapping("/logout")
 * public APIResponseDTO<Void> logout(@RequestUser AccessTokenPayload userPayload) {
 *     authService.logoutUser(userPayload);
 *     return APIResponseDTO.success(null);
 * }
 * }</pre>
 *
 * @see RequestUserArgumentResolver
 * @see AccessTokenHandlerInterceptor
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequestUser {
}
