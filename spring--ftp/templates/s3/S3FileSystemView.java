package {{basePackage}}.ftp.s3;

import {{basePackage}}.ftp.FTPS3Configuration;
import org.apache.ftpserver.ftplet.FileSystemView;
import org.apache.ftpserver.ftplet.FtpException;
import org.apache.ftpserver.ftplet.FtpFile;
import org.apache.ftpserver.ftplet.User;
import software.amazon.awssdk.services.s3.S3Client;

import java.util.ArrayList;

public class S3FileSystemView implements FileSystemView {

    private final User user;
    private final S3Client s3Client;
    private final String bucket;
    private final String keyPrefix;
    private final FTPS3Configuration fileHandler;
    private String current = "/";

    public S3FileSystemView(User user, S3Client s3Client, String bucket, String keyPrefix, FTPS3Configuration fileHandler) {
        this.user = user;
        this.s3Client = s3Client;
        this.bucket = bucket;
        this.keyPrefix = keyPrefix;
        this.fileHandler = fileHandler;
    }

    @Override
    public FtpFile getHomeDirectory() {
        return file("/");
    }

    @Override
    public FtpFile getWorkingDirectory() {
        return file(current);
    }

    @Override
    public boolean changeWorkingDirectory(String dir) throws FtpException {
        String next = resolveFromS3Path(dir);
        var target = file(next);
        if (!target.isDirectory()) {
            return false;
        }
        current = target.getAbsolutePath();
        return true;
    }

    @Override
    public FtpFile getFile(String path) {
        return file(resolveFromS3Path(path));
    }

    @Override
    public boolean isRandomAccessible() {
        return true;
    }

    @Override
    public void dispose() {
    }

    private S3FileObject file(String path) {
        return new S3FileObject(path, user, s3Client, bucket, keyPrefix, fileHandler);
    }

    private String resolveFromS3Path(String path) {
        if (path == null || path.isBlank() || ".".equals(path)) {
            return current;
        }
        String value = path.replace('\\', '/');
        String combined = value.startsWith("/") ? value : ("/".equals(current) ? "/" + value : current + "/" + value);
        var parts = new ArrayList<String>();
        for (String part : combined.split("/")) {
            if (part.isEmpty() || ".".equals(part)) {
                continue;
            }
            if ("..".equals(part)) {
                if (!parts.isEmpty()) {
                    parts.remove(parts.size() - 1);
                }
                continue;
            }
            parts.add(part);
        }
        if (parts.isEmpty()) {
            return "/";
        }
        return "/" + String.join("/", parts);
    }
}
