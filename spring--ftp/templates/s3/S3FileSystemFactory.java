package {{basePackage}}.ftp.s3;

import {{basePackage}}.ftp.FTPS3Configuration;
import org.apache.ftpserver.ftplet.FileSystemFactory;
import org.apache.ftpserver.ftplet.FileSystemView;
import org.apache.ftpserver.ftplet.User;
import software.amazon.awssdk.services.s3.S3Client;

public class S3FileSystemFactory implements FileSystemFactory {

    private final S3Client s3Client;
    private final String bucket;
    private final String keyPrefix;
    private final FTPS3Configuration fileHandler;

    public S3FileSystemFactory(S3Client s3Client, String bucket, String keyPrefix, FTPS3Configuration fileHandler) {
        this.s3Client = s3Client;
        this.bucket = bucket;
        this.keyPrefix = keyPrefix;
        this.fileHandler = fileHandler;
    }

    @Override
    public FileSystemView createFileSystemView(User user) {
        return new S3FileSystemView(user, s3Client, bucket, keyPrefix, fileHandler);
    }
}
