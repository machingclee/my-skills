package {{basePackage}}.user.authentication.common.domain.enums;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Arrays;

/**
 * Minimal user access roles. Add more constants here as the consuming project needs
 * them — the @AccessToken(role = {...}) machinery already supports any subset.
 * ADMINISTRATOR is mandatory: AuthController.viewRefreshTokens guards on it.
 */
public enum UserRole {

//region User Role Definition

    /**
     * Administrator
     */
    ADMINISTRATOR("administrator"),

    /**
     * Standard application user
     */
    USER("user");

//endregion

//region Variable

    /**
     * The string representation stored inside the database
     */
    private final String dbValue;

//endregion

//region Constructor

    /**
     * Initializes the role configuration
     *
     * @param dbValue The string constant synchronized directly with database
     */
    UserRole(String dbValue) {
        this.dbValue = dbValue;
    }

//endregion

//region Interface

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        return this.dbValue;
    }

    /**
     * Resolve a text record back into its concrete domain Enum state.
     *
     * @param value Raw String
     * @return The matching verified UserRole
     */
    public static UserRole fromDbValue(String value) {
        return Arrays.stream(UserRole.values())
                .filter(r -> r.dbValue.equalsIgnoreCase(value))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown role: " + value));
    }

    /**
     * JPA attribute converter providing translation.
     */
    @Converter(autoApply = true)
    public static class RoleConverter implements AttributeConverter<UserRole, String> {

        /**
         * Serialize active state back into raw SQL values
         */
        @Override
        public String convertToDatabaseColumn(UserRole role) {
            return role == null ? null : role.toString();
        }

        /**
         * Deserialize storage data straight into User Role
         */
        @Override
        public UserRole convertToEntityAttribute(String dbValue) {
            return dbValue == null ? null : UserRole.fromDbValue(dbValue);
        }

    }

//endregion

}
