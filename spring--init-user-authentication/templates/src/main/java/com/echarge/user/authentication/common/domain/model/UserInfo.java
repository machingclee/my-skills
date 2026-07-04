package {{basePackage}}.user.authentication.common.domain.model;

import {{basePackage}}.user.authentication.common.domain.enums.UserRole;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NonNull;
import lombok.Setter;

@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@Getter
@Setter
public class UserInfo implements Comparable<UserInfo> {

//region Variable

    /**
     * User ID
     */
    @NonNull
    @EqualsAndHashCode.Include
    private UserId userId;

    /**
     * User role
     */
    @NonNull
    private UserRole role;

    /**
     * Is a test account
     */
    private Boolean isTest;

    /**
     * Create date
     */
    private Long createDate;

//endregion

//region Interface

    /**
     * {@inheritDoc}
     */
    @Override
    public int compareTo(@NonNull UserInfo o) {
        return this.getUserId().compareTo(o.userId);
    }

//endregion

}
