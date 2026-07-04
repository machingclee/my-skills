package {{basePackage}}.user.authentication.common.authentication.jwt;

import {{basePackage}}.user.authentication.common.domain.model.UserId;
import {{basePackage}}.user.authentication.common.jpa.entity.User;
import {{basePackage}}.user.authentication.common.jpa.repository.UserInfoRepository;
import {{basePackage}}.user.authentication.common.authentication.jwt.payload.AccessTokenPayload;
import {{basePackage}}.user.authentication.common.authentication.jwt.payload.RefreshTokenPayload;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;

public class JwtUtil {

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration}")
    private long expiration;

    @Value("${jwt.refresh-token.expiration}")
    private long refreshTokenExpiration;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final UserInfoRepository userInfoRepository;

    public record RefreshTokenGeneration(Long issuedAt, String refreshToken, Long loginExpiredAt) {
    }


    public JwtUtil(UserInfoRepository userInfoRepository) {
        this.userInfoRepository = userInfoRepository;
    }

    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(Decoders.BASE64URL.decode(secret));
    }

    public String generateAccessToken(UserId userId) {
        return this.generateAccessToken(userId, Optional.empty());
    }

    public String generateAccessToken(UserId userId, Optional<Long> issuedAt) {
        User user = userInfoRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));
        var payload = new AccessTokenPayload();

        var userInfo = new {{basePackage}}.user.authentication.common.domain.model.UserInfo();
        userInfo.setUserId(user.getId());
        userInfo.setRole(user.getRole());
        userInfo.setIsTest(user.getIsTest());
        var now = Instant.now();

        var createdAtMilli = issuedAt.orElse(user.getCreateDate().toEpochMilli());

        userInfo.setCreateDate(createdAtMilli);
        payload.setUser(userInfo);
        long nowMilli = now.toEpochMilli();
        payload.setIssuedAt(nowMilli);
        payload.setExpiredAt(nowMilli + expiration);
        var claims = objectMapper.convertValue(payload, Map.class);
        return Jwts.builder()
                .claims(claims)
                .signWith(getSigningKey())
                .compact();
    }


    public RefreshTokenGeneration generateRefreshToken(UserId userId) {
        return this.generateRefreshToken(userId, Optional.empty());
    }

    /**
     * @param userId
     * @param oldRefreshToken
     * @apiNote When oldRefreshToken is null, this function creates a fresh refreshToken;
     * Otherwise this function simply create a new token with new issuedAt and it inherits old loginExpiredAt
     */
    public RefreshTokenGeneration generateRefreshToken(UserId userId, Optional<RefreshTokenPayload> oldRefreshToken) {
        long now = Instant.now().toEpochMilli();
        var payload = new RefreshTokenPayload();
        payload.setUserId(userId);
        payload.setIssuedAt(now);

        if (oldRefreshToken.isEmpty()) {
            payload.setLoginExpiredAt(now + refreshTokenExpiration);
        } else {
            payload.setLoginExpiredAt(oldRefreshToken.get().getLoginExpiredAt());
        }

        var claims = objectMapper.convertValue(payload, Map.class);

        var refreshToken = Jwts.builder()
                .claims(claims)
                .signWith(getSigningKey())
                .compact();

        return new RefreshTokenGeneration(now, refreshToken, payload.getLoginExpiredAt());
    }

    public <T> T parseToken(String token, Class<T> clazz) {
        Claims claims = Jwts.parser()
                .verifyWith(getSigningKey())
                .clockSkewSeconds(Long.MAX_VALUE / 1000) // disable built-in exp check (exp is in ms)
                .build()
                .parseSignedClaims(token)
                .getPayload();

        return objectMapper.convertValue(claims, clazz);
    }
}
