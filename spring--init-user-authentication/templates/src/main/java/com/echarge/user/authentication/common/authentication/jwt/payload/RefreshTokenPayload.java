package {{basePackage}}.user.authentication.common.authentication.jwt.payload;

import {{basePackage}}.user.authentication.common.domain.model.UserId;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RefreshTokenPayload {

    private UserId userId;
    private Long issuedAt;
    private Long loginExpiredAt;

}
