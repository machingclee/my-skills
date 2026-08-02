package {{basePackage}}.user.authentication.common.interceptor;

import {{basePackage}}.user.authentication.common.authentication.annotation.AccessToken;
import {{basePackage}}.user.authentication.common.authentication.jwt.JwtUtil;
import {{basePackage}}.user.authentication.common.authentication.jwt.payload.AccessTokenPayload;
import {{basePackage}}.user.authentication.common.domain.enums.UserRole;
import {{basePackage}}.user.authentication.common.exception.JWTAuthException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Arrays;
import lombok.NonNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.annotation.AnnotationUtils;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Validates Bearer JWTs on endpoints marked with {@link AccessToken}, then exposes the
 * parsed {@link AccessTokenPayload} as a request attribute so
 * {@link {{basePackage}}.user.authentication.common.resolver.RequestUserArgumentResolver}
 * can inject it into controller methods.
 * <p>
 * Flow:
 * <ol>
 *   <li>Skip non-{@link HandlerMethod} handlers.</li>
 *   <li>If neither class nor method has {@link AccessToken}, allow through.</li>
 *   <li>Require {@code Authorization: Bearer &lt;token&gt;}.</li>
 *   <li>Parse + expiry-check the access token; optional role gate from the annotation.</li>
 *   <li>Store the payload under {@link #AUTH_JWT_PAYLOAD_ATTR} for argument resolution.</li>
 * </ol>
 */
public class AccessTokenHandlerInterceptor implements HandlerInterceptor {

//region Variable

    /** Request attribute name used to expose the validated JWT payload to argument resolvers */
    public static final String AUTH_JWT_PAYLOAD_ATTR = "authJwtPayload";

    /** MDC key for the authenticated user id (matches domainutil {@code MdcContextKeys.USER_ID}) */
    private static final String MDC_USER_ID = "userId";

    private static final Logger logger = LoggerFactory.getLogger(AccessTokenHandlerInterceptor.class);

    private final JwtUtil jwtUtil;

//endregion

//region Constructor

    public AccessTokenHandlerInterceptor(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

//endregion

//region Handler

    @Override
    public boolean preHandle(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull Object handler
    ) {
        if (!(handler instanceof HandlerMethod handlerMethod)) {
            return true;
        }

        boolean hasClassAnnotation =
                AnnotationUtils.findAnnotation(handlerMethod.getBeanType(), AccessToken.class) != null;
        boolean hasMethodAnnotation =
                AnnotationUtils.findAnnotation(handlerMethod.getMethod(), AccessToken.class) != null;
        if (!hasClassAnnotation && !hasMethodAnnotation) {
            return true;
        }

        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new JWTAuthException(JWTAuthException.Error.MISSING_ACCESS_TOKEN);
        }
        String token = authHeader.substring(7);
        if (token.isBlank()) {
            throw new JWTAuthException(JWTAuthException.Error.MISSING_ACCESS_TOKEN);
        }

        try {
            AccessTokenPayload payload = this.jwtUtil.parseToken(token, AccessTokenPayload.class);
            if (System.currentTimeMillis() > payload.getExpiredAt()) {
                throw new JWTAuthException(JWTAuthException.Error.JWT_EXPIRED);
            }

            // Method-level annotation overrides class-level (role lists included)
            AccessToken accessToken =
                    AnnotationUtils.findAnnotation(handlerMethod.getMethod(), AccessToken.class);
            if (accessToken == null) {
                accessToken = AnnotationUtils.findAnnotation(handlerMethod.getBeanType(), AccessToken.class);
            }

            if (accessToken != null && accessToken.role().length >= 1) {
                UserRole userRole = payload.getUser().getRole();
                boolean hasRole = Arrays.stream(accessToken.role()).anyMatch(required -> required == userRole);
                if (!hasRole) {
                    throw new JWTAuthException(JWTAuthException.Error.FORBIDDEN);
                }
            }

            MDC.put(MDC_USER_ID, payload.getUser().getUserId().toString());
            // Exposed for RequestUserArgumentResolver → controller @RequestUser AccessTokenPayload
            request.setAttribute(AUTH_JWT_PAYLOAD_ATTR, payload);
            return true;
        } catch (JWTAuthException e) {
            throw e;
        } catch (Exception e) {
            AccessTokenHandlerInterceptor.logger.error(e.getMessage());
            throw new JWTAuthException(JWTAuthException.Error.JWT_EXPIRED);
        }
    }

    @Override
    public void afterCompletion(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull Object handler,
            Exception ex
    ) {
        MDC.remove(MDC_USER_ID);
    }

//endregion

}
