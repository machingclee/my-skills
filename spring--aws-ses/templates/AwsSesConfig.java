package {{basePackage}}.common.aws.ses;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.ses.SesClient;

/**
 * SES client for outbound mail. Credentials come from the default provider chain
 * (env / profile locally, Lambda execution role in AWS). No static keys.
 * <p>
 * {@code app.ses.region} must be the region where {@code app.ses.from-address}
 * was verified as an SES identity.
 */
@Configuration(proxyBeanMethods = false)
public class AwsSesConfig {

    @Bean(destroyMethod = "close")
    public SesClient sesClient(@Value("${app.ses.region:ap-northeast-1}") String region) {
        return SesClient.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }
}
