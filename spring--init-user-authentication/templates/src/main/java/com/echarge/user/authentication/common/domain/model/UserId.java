package {{basePackage}}.user.authentication.common.domain.model;

import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Comparator;

import lombok.*;

/**
 * Core Domain representation of a unique User Identity within the E-Charge ecosystem.
 */
@Embeddable
@EqualsAndHashCode()
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
public class UserId implements Comparable<UserId>, Serializable {

//region Variable

    /**
     * User ID
     */
    @NonNull
    private String userId;

//endregion

//region Interface

    /**
     * {@inheritDoc}
     */
    public String toString() {
        return this.userId;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public int compareTo(@NonNull UserId o) {
        return Comparator.comparing(UserId::getUserId, Comparator.nullsFirst(Comparator.naturalOrder()))
                .compare(this, o);
    }

//endregion

}
