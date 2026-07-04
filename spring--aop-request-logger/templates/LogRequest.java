package {{basePackage}}.common.aop.logging;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marker annotation for controller classes. Place on a {@code @RestController}
 * (or any bean) to have every method wrapped by {@link LogRequestAspect}, which
 * logs the HTTP method, URI, headers, request body, elapsed time, and errors.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface LogRequest {
}
