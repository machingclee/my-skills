package {{basePackage}}.common.aop.logging;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Enable scoped Hibernate SQL logging with N+1 detection for the annotated
 * method or all methods of the annotated class.
 * <p>
 * At the end of execution a deduplicated summary is printed showing total
 * queries, unique patterns, and N+1 candidates (patterns repeating ≥3 times)
 * with the entity name and call site.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface LogQuery {
}
