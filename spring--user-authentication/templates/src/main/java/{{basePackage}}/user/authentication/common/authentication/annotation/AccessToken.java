package {{basePackage}}.user.authentication.common.authentication.annotation;

import {{basePackage}}.user.authentication.common.domain.enums.UserRole;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Requires a valid Bearer access token on the annotated controller type or method.
 * <p>
 * Validated by {@code AccessTokenHandlerInterceptor}. After validation the parsed
 * {@code AccessTokenPayload} is available for injection via {@code @RequestUser}
 * on controller method parameters (argument resolver) — do not re-parse the header
 * in the controller.
 * <p>
 * Optional {@link #role()} restricts access to the listed roles (empty = any
 * authenticated user). Method-level annotation wins over class-level for the role list.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface AccessToken {
    /**
     * Allowed roles. Empty means any authenticated user.
     */
    UserRole[] role() default {};
}
