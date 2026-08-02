package {{basePackage}}.user.authentication.common.exception;

/**
 * Thrown by the access-token interceptor when authentication or role checks fail.
 */
public class JWTAuthException extends RuntimeException {

    public enum Error {
        JWT_EXPIRED,
        LOGIN_EXPIRED,
        MISSING_REFRESH_TOKEN,
        MISSING_ACCESS_TOKEN,
        FORBIDDEN
    }

    public JWTAuthException(Error message) {
        super(message.name());
    }
}
