package {{basePackage}}.user.authentication.common.configuration;

import software.amazon.awssdk.enhanced.dynamodb.DynamoDbEnhancedClient;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import {{basePackage}}.user.authentication.common.authentication.crypto.Sha512PasswordEncoder;
import {{basePackage}}.user.authentication.common.exception.JwtAuthExceptionHandler;
import {{basePackage}}.user.authentication.common.interceptor.AccessTokenHandlerInterceptor;
import {{basePackage}}.user.authentication.common.resolver.RequestUserArgumentResolver;
import {{basePackage}}.user.authentication.controller.AuthController;
import {{basePackage}}.user.authentication.common.jpa.repository.UserInfoRepository;
import {{basePackage}}.user.authentication.service.AuthApplicationService;
import {{basePackage}}.user.authentication.common.authentication.jwt.JwtUtil;
import {{basePackage}}.user.authentication.common.infrastructure.dynamodb.repository.RefreshTokenRepository;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;

import java.util.Map;
import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Main AutoConfiguration entry point for the user.authentication module.
 */
@org.springframework.boot.autoconfigure.AutoConfiguration
@Import({DynamoDbConfiguration.class, SwaggerConfiguration.class})
@EnableConfigurationProperties(AuthDbProperties.class)
public class AutoConfiguration {

//region Logger

    private static final Logger log = LoggerFactory.getLogger(AutoConfiguration.class);

//endregion

//region Storage & Database Related

    /**
     * Resolves and provides the active DataSource for the authentication module.
     * Priority 1: Creates an isolated connection pool if explicit host details are present. (From AuthDbProperties)
     * Priority 2: Intercepts and binds to a specific named bean definition (From AuthDbProperties)
     * Priority 3: Captures the application's default primary data source connection as a global fallback. (From Spring Injection)
     *
     * @param props The parsed external 'authdb' configuration properties mapping template.
     * @param ctx   The central Spring ApplicationContext engine utilized for container bean lookups.
     * @return A valid DataSource connection pool.
     */
    @Bean(name = "authDataSource")
    @ConditionalOnMissingBean(name = "authDataSource")
    public DataSource authDataSource(AuthDbProperties props, ApplicationContext ctx) {
        // Priority 1: dedicated datasource — authdb.host is set
        if (props.getHost() != null && !props.getHost().isBlank()) {
            log.info("[user.authentication] Using DEDICATED auth DataSource → {}", props.buildJdbcUrl());
            HikariDataSource ds = new HikariDataSource();
            ds.setJdbcUrl(props.buildJdbcUrl());
            ds.setUsername(props.getUsername());
            ds.setPassword(props.getPassword());
            ds.setDriverClassName(props.getDriverClassName());
            return ds;
        }
        // Priority 2: named fallback — authdb.datasource-bean-name is set (for read/write split)
        String beanName = props.getDatasourceBeanName();
        if (beanName != null && !beanName.isBlank()) {
            log.info("[user.authentication] Using FALLBACK auth DataSource → reusing named bean: '{}'", beanName);
            return (DataSource) ctx.getBean(beanName);
        }
        // Priority 3: reuse @Primary DataSource — throws if multiple exist with no @Primary
        DataSource primary = ctx.getBean(DataSource.class);
        log.info("[user.authentication] Using FALLBACK auth DataSource → reusing primary bean: {}", primary.getClass().getName());
        return primary;
    }

    /**
     * Configures and registers the entity manager factory bean (JPA Engine)
     *
     * @param dataSource       The isolated or shared connection pool managed by the container.
     * @param authDbProperties The target environment's database behavior properties.
     * @return A fully configured Hibernate-backed EntityManagerFactory instance.
     */
    @Bean(name = "authEntityManagerFactory")
    public LocalContainerEntityManagerFactoryBean authEntityManagerFactory(
            @Qualifier("authDataSource") DataSource dataSource,
            AuthDbProperties authDbProperties
    ) {
        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setPackagesToScan(
                "{{basePackage}}.user.authentication.common.jpa.entity",
                "{{basePackage}}.user.authentication.common.domain.model"
        );
        em.setPersistenceUnitName("authPU");
        em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        em.setJpaPropertyMap(Map.of("hibernate.hbm2ddl.auto", authDbProperties.getDdlAuto()));
        return em;
    }

    /**
     * Registers a shared proxy from the entity manager factory bean
     *
     * @param authEntityManagerFactory The specialized factory driving the authentication persistence unit.
     * @return A thread-safe, transaction-managed EntityManager proxy.
     */
    @Bean(name = "authEntityManager")
    public EntityManager authEntityManager(
            @Qualifier("authEntityManagerFactory") EntityManagerFactory authEntityManagerFactory
    ) {
        return authEntityManagerFactory.createEntityManager();
    }

    /**
     * Dynamic initialization of repository backing Spring Data JPA factories.
     *
     * @param authEntityManager The shared entity manager proxy.
     * @return An instance of the UserInfoRepository.
     */
    @Bean
    public UserInfoRepository userInfoRepository(@Qualifier("authEntityManager") EntityManager authEntityManager) {
        return new JpaRepositoryFactory(authEntityManager).getRepository(UserInfoRepository.class);
    }

    /**
     * Instantiates and registers the repository provider responsible for managing user session refresh tokens within Amazon DynamoDB.
     *
     * @param enhancedClient The high-level DynamoDB client used for object-relational mapping (mapping entities to tables).
     * @param dynamoDbClient The low-level standard AWS DynamoDB core client for direct database operations.
     * @return An instance of the RefreshTokenDynamoRepository.
     */
    @Bean
    public RefreshTokenRepository refreshTokenDynamoRepository(DynamoDbEnhancedClient enhancedClient, DynamoDbClient dynamoDbClient) {
        return new RefreshTokenRepository(enhancedClient, dynamoDbClient);
    }

//endregion

//region Security Infrastructure & Cryptography

    @Bean
    public JwtUtil jwtUtil(UserInfoRepository repo) {
        return new JwtUtil(repo);
    }

    @Bean
    @Primary
    public PasswordEncoder passwordEncoder() {
        return new Sha512PasswordEncoder();
    }

//endregion

//region Core Application Use-Cases

    @Bean
    public AuthApplicationService authService(
            UserInfoRepository repository,
            JwtUtil jwtUtil,
            @Qualifier("authEntityManagerFactory") EntityManagerFactory emf,
            PasswordEncoder passwordEncoder,
            RefreshTokenRepository refreshTokenDynamoRepository
    ) {
        return new AuthApplicationService(repository, jwtUtil, emf, passwordEncoder, refreshTokenDynamoRepository);
    }

//endregion

//region Presentation & Web Boundary Layer Utilities

    @Bean
    public AuthController authController(AuthApplicationService authService) {
        return new AuthController(authService);
    }

    @Bean
    @ConditionalOnBean(JwtUtil.class)
    public AccessTokenHandlerInterceptor accessTokenInterceptor(JwtUtil jwtUtil) {
        return new AccessTokenHandlerInterceptor(jwtUtil);
    }

    @Bean
    public RequestUserArgumentResolver requestUserArgumentResolver() {
        return new RequestUserArgumentResolver();
    }

    @Bean
    @ConditionalOnBean({AccessTokenHandlerInterceptor.class, RequestUserArgumentResolver.class})
    public WebConfig webConfig(AccessTokenHandlerInterceptor accessTokenInterceptor, RequestUserArgumentResolver requestUserArgumentResolver) {
        return new WebConfig(accessTokenInterceptor, requestUserArgumentResolver);
    }

    @Bean
    public JwtAuthExceptionHandler jwtExceptionHandler() {
        return new JwtAuthExceptionHandler();
    }

//endregion

}
