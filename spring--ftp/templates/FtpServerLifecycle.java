package {{basePackage}}.ftp;

import {{basePackage}}.ftp.s3.S3FileSystemFactory;
import org.apache.ftpserver.DataConnectionConfigurationFactory;
import org.apache.ftpserver.FtpServer;
import org.apache.ftpserver.FtpServerFactory;
import org.apache.ftpserver.ftplet.FtpException;
import org.apache.ftpserver.listener.ListenerFactory;
import org.apache.ftpserver.usermanager.impl.BaseUser;
import org.apache.ftpserver.usermanager.impl.ConcurrentLoginPermission;
import org.apache.ftpserver.usermanager.impl.WritePermission;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

import java.util.List;

public class FtpServerLifecycle implements DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(FtpServerLifecycle.class);

    private final FTPS3Configuration configuration;
    private FtpServer ftpServer;
    private S3Client s3Client;

    public FtpServerLifecycle(FTPS3Configuration configuration) {
        this.configuration = configuration;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void startFtpServer() throws FtpException {
        s3Client = S3Client.builder()
                .region(Region.of(configuration.getRegion()))
                .build();

        var factory = new FtpServerFactory();
        var dataConnectionFactory = new DataConnectionConfigurationFactory();
        dataConnectionFactory.setPassivePorts(Integer.toString(configuration.getDataPort()));
        if (configuration.getPassiveAddress() != null && !configuration.getPassiveAddress().isBlank()) {
            dataConnectionFactory.setPassiveExternalAddress(configuration.getPassiveAddress());
        }

        var listenerFactory = new ListenerFactory();
        listenerFactory.setPort(configuration.getPort());
        listenerFactory.setDataConnectionConfiguration(dataConnectionFactory.createDataConnectionConfiguration());
        factory.addListener("default", listenerFactory.createListener());

        var user = new BaseUser();
        user.setName(configuration.getUsername());
        user.setPassword(configuration.getPassword() == null ? "" : configuration.getPassword());
        user.setHomeDirectory("/");
        user.setAuthorities(List.of(new WritePermission(), new ConcurrentLoginPermission(0, 0)));
        factory.setUserManager(new StaticUserManager(user));
        factory.setFileSystem(new S3FileSystemFactory(
                s3Client, configuration.getBucket(), configuration.keyPrefix(), configuration));

        ftpServer = factory.createServer();
        ftpServer.start();
        log.info("FTP server started on port {} with data port {}, uploading to bucket {}",
                configuration.getPort(), configuration.getDataPort(), configuration.getBucket());
    }

    @Override
    public void destroy() {
        if (ftpServer != null) {
            ftpServer.stop();
        }
        if (s3Client != null) {
            s3Client.close();
        }
    }
}
