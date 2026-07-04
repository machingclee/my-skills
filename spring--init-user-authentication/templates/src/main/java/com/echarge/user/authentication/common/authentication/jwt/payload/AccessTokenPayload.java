package {{basePackage}}.user.authentication.common.authentication.jwt.payload;

import {{basePackage}}.user.authentication.common.domain.model.UserInfo;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AccessTokenPayload {

    private UserInfo user;
    private Long issuedAt;
    private Long expiredAt;

}
