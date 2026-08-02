package {{basePackage}}.user.authentication.common.configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Infrastructure Configuration class that registers and customizes the Swagger UI.
 */
@Configuration
public class SwaggerConfiguration {

    /**
     * Display title from resource property
     */
    @Value("${springdoc.name}")
    private String SpringDocName;

    /**
     * Set Swagger User Interface
     */
    @Bean
    public OpenAPI openAPI(@Value("${springdoc.version}") String appVersion) {
        return new OpenAPI()
                // --- Set API General Portal Metadata ---
                .info(new Info()
                        .title(this.SpringDocName)
                        .version(appVersion)
                        .description("Testing and Development Webpage")
                )
                // --- Register Shared Cryptographic Components ---
                .components(new Components()
                        .addSecuritySchemes("bearerAuth",
                                new SecurityScheme()
                                        .type(SecurityScheme.Type.HTTP)
                                        .scheme("bearer")
                                        .bearerFormat("JWT")
                                        .description("Enter your access token (sent as Authorization: Bearer <token>)"
                                        )
                        )
                        .addSecuritySchemes("refreshToken",
                                new SecurityScheme()
                                        .type(SecurityScheme.Type.APIKEY)
                                        .in(SecurityScheme.In.HEADER)
                                        .name("Refresh-Token")
                                        .description("Enter your refresh token (sent as Refresh-Token: <token>)"
                                        )
                        )
                )
                // --- Enforce Security System Globally Across All Paths ---
                .addSecurityItem(new SecurityRequirement()
                        .addList("bearerAuth")
                        .addList("refreshToken"));
    }
}
