package {{basePackage}}.user.authentication.common.authentication.annotation;

import {{basePackage}}.user.authentication.common.domain.enums.UserRole;

import java.lang.annotation.*;

@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface AccessToken {
    UserRole[] role() default {};
}
