package {{basePackage}}.ftp;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
@Profile("dev")
public class FTPConfig extends FTPS3Configuration {

    public FTPConfig(
            @Value("${app.ftp.port}") int port,
            @Value("${app.ftp.data-port}") int dataPort,
            @Value("${app.ftp.bucket}") String bucket,
            @Value("${app.ftp.region}") String region,
            @Value("${app.ftp.prefix}") String prefix,
            @Value("${app.ftp.username}") String username,
            @Value("${app.ftp.password}") String password,
            @Value("${app.ftp.passive-address:}") String passiveAddress) {
        super(port, dataPort, bucket, region, prefix, username, password, passiveAddress);
    }

    @Override
    public void preUpload(String fileName, String s3Key) throws IOException {
    }

    @Override
    public void postUpload(String fileName, String s3Key, long totalBytes) throws IOException {
    }

    @Override
    public void preDownload(String s3Key, long offset) throws IOException {
    }

    @Override
    public void postDownload(String s3Key, long bytesRead) throws IOException {
    }
}
