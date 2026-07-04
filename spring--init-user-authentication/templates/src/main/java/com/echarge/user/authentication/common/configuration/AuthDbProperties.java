package {{basePackage}}.user.authentication.common.configuration;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Type-safe configuration mappings for the user authentication relational database.
 */
@Data
@ConfigurationProperties(prefix = "authdb")
public class AuthDbProperties {

//region Common Setup

    /**
     * Controls ddl-auto for the auth EntityManagerFactory.
     * Defaults to "none" for safety to prevent unexpected drop or delete action during startup
     */
    private String ddlAuto = "none";

//endregion

//region Local Database Properties (Bound from external 'authdb' settings e.g. application.yml)

    /**
     * Target database host. If left blank or null, the AutoConfiguration triggers fallback mechanism to scan the Spring container for an existing shared bean
     */
    private String host;

    /**
     * Connection port utilized by the MySQL server instance. Defaults to standard 3306
     */
    private int port = 3306;

    /**
     * Target MySQL database schema name
     */
    private String schema;

    /**
     * Database account credential username
     */
    private String username;

    /**
     * Database account credential password
     */
    private String password;

    /**
     * Driver class used by JDBC connection managers. Defaults to the MySQL Connector/J driver
     */
    private String driverClassName = "com.mysql.cj.jdbc.Driver";

    /**
     * Return a JDBC Connection String to build connection
     *
     * @return A formatted JDBC connection URL string
     */
    public String buildJdbcUrl() {
        return "jdbc:mysql://" + this.host + ":" + this.port + "/" + this.schema + "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC";
    }

//endregion

//region Connection from Bean (e.g. Inherit from Parent)

    /**
     * Optional.
     * Alternate Bean lookup indicator used in multi-pool architectures (e.g., CQRS Read/Write Split).
     * Specifies the precise target Bean Identifier to intercept and duplicate if an explicit 'authdb.host' connection route is not provided.
     * Example: authdb.datasource-bean-name=writeDataSource
     */
    private String datasourceBeanName;

//endregion

}
