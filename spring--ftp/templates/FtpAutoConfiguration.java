package {{basePackage}}.ftp;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("!test")
public class FtpAutoConfiguration {

    @Bean
    public FtpServerLifecycle ftpServerLifecycle(ObjectProvider<FTPS3Configuration> configurations) {
        FTPS3Configuration configuration = configurations.getIfAvailable();
        if (configuration == null) {
            return null;
        }
        return new FtpServerLifecycle(configuration);
    }
}
