package {{basePackage}}.ftp.s3;

import {{basePackage}}.ftp.FTPS3Configuration;
import org.apache.ftpserver.ftplet.FtpFile;
import org.apache.ftpserver.ftplet.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class S3FileObject implements FtpFile {

    private static final Logger log = LoggerFactory.getLogger(S3FileObject.class);

    private final String path;
    private final String ownerName;
    private final S3Client s3Client;
    private final String bucket;
    private final String keyPrefix;
    private final FTPS3Configuration fileHandler;
    private final Boolean knownDirectory;
    private long size = -1;
    private long lastModified;
    private boolean metadataKnown;
    private Boolean directory;

    public S3FileObject(
            String path,
            User user,
            S3Client s3Client,
            String bucket,
            String keyPrefix,
            FTPS3Configuration fileHandler) {
        this(path, user == null ? "" : user.getName(), s3Client, bucket, keyPrefix, fileHandler, null, -1, 0, false);
    }

    private S3FileObject(
            String path,
            String ownerName,
            S3Client s3Client,
            String bucket,
            String keyPrefix,
            FTPS3Configuration fileHandler,
            Boolean knownDirectory,
            long size,
            long lastModified,
            boolean metadataKnown) {
        this.path = path;
        this.ownerName = ownerName;
        this.s3Client = s3Client;
        this.bucket = bucket;
        this.keyPrefix = keyPrefix == null ? "" : keyPrefix;
        this.fileHandler = fileHandler;
        this.knownDirectory = knownDirectory;
        this.size = size;
        this.lastModified = lastModified;
        this.metadataKnown = metadataKnown;
        this.directory = knownDirectory;
    }

    @Override
    public OutputStream createOutputStream(long offset) throws IOException {
        var fileNamePath = Path.of(path).getFileName();
        String fileName = fileNamePath == null ? path : fileNamePath.toString();
        String s3Key = keyPrefix + Instant.now().toEpochMilli() + "/" + fileName;
        fileHandler.preUpload(fileName, s3Key);
        return new S3OutputStream(s3Client, bucket, s3Key, totalBytes -> fileHandler.postUpload(fileName, s3Key, totalBytes));
    }

    @Override
    public InputStream createInputStream(long offset) throws IOException {
        if (directory()) {
            throw new IOException("Cannot download a directory: " + normalizedPath());
        }
        String s3Key = objectKey();
        fileHandler.preDownload(s3Key, offset);
        try {
            InputStream source = offset > 0
                    ? s3Client.getObject(builder -> builder.bucket(bucket).key(s3Key).range("bytes=" + offset + "-"))
                    : s3Client.getObject(builder -> builder.bucket(bucket).key(s3Key));
            return finishingDownload(source, s3Key);
        } catch (NoSuchKeyException exception) {
            throw new IOException("S3 object not found: " + s3Key, exception);
        } catch (S3Exception exception) {
            throw new IOException("S3 download failed for key=" + s3Key, exception);
        }
    }

    private InputStream finishingDownload(InputStream source, String s3Key) {
        return new FilterInputStream(source) {
            private long bytesRead;
            private boolean finished;

            @Override
            public int read() throws IOException {
                int value = super.read();
                if (value >= 0) {
                    bytesRead++;
                }
                return value;
            }

            @Override
            public int read(byte[] buffer, int offset, int length) throws IOException {
                int count = super.read(buffer, offset, length);
                if (count > 0) {
                    bytesRead += count;
                }
                return count;
            }

            @Override
            public void close() throws IOException {
                if (finished) {
                    return;
                }
                finished = true;
                super.close();
                fileHandler.postDownload(s3Key, bytesRead);
            }
        };
    }

    @Override
    public List<? extends FtpFile> listFiles() {
        if (!isDirectory()) {
            return List.of();
        }
        var files = new ArrayList<FtpFile>();
        var request = ListObjectsV2Request.builder()
                .bucket(bucket)
                .prefix(listPrefix())
                .delimiter("/")
                .build();
        for (var page : s3Client.listObjectsV2Paginator(request)) {
            for (var commonPrefix : page.commonPrefixes()) {
                files.add(child(ftpPath(commonPrefix.prefix()), true, 0, 0));
            }
            for (var object : page.contents()) {
                if (object.key().equals(listPrefix()) || object.key().endsWith("/")) {
                    continue;
                }
                long modified = object.lastModified() == null ? 0 : object.lastModified().toEpochMilli();
                files.add(child(ftpPath(object.key()), false, object.size(), modified));
            }
        }
        log.info("S3 list bucket={} prefix='{}' entries={}", bucket, listPrefix(), files.size());
        return files;
    }

    @Override
    public boolean doesExist() {
        return true;
    }

    @Override
    public boolean isDirectory() {
        return directory();
    }

    @Override
    public boolean isFile() {
        return !directory();
    }

    @Override
    public boolean isHidden() {
        return false;
    }

    @Override
    public boolean isReadable() {
        return true;
    }

    @Override
    public boolean isWritable() {
        return !directory();
    }

    @Override
    public boolean isRemovable() {
        return false;
    }

    @Override
    public String getAbsolutePath() {
        return normalizedPath();
    }

    @Override
    public String getName() {
        String normalized = normalizedPath();
        if ("/".equals(normalized)) {
            return "/";
        }
        int slash = normalized.lastIndexOf('/');
        return normalized.substring(slash + 1);
    }

    @Override
    public long getSize() {
        if (directory()) {
            return 0;
        }
        loadMetadata();
        return size;
    }

    @Override
    public String getOwnerName() {
        return ownerName;
    }

    @Override
    public String getGroupName() {
        return "";
    }

    @Override
    public int getLinkCount() {
        return 1;
    }

    @Override
    public long getLastModified() {
        if (!directory()) {
            loadMetadata();
        }
        return lastModified;
    }

    private S3FileObject child(String childPath, boolean childDirectory, long childSize, long childModified) {
        return new S3FileObject(childPath, ownerName, s3Client, bucket, keyPrefix, fileHandler, childDirectory, childSize, childModified, true);
    }

    private boolean directory() {
        if (directory == null) {
            directory = detectDirectory();
        }
        return directory;
    }

    private boolean detectDirectory() {
        if (knownDirectory != null) {
            return knownDirectory;
        }
        if ("/".equals(normalizedPath())) {
            return true;
        }
        if (objectExists()) {
            return false;
        }
        var listed = s3Client.listObjectsV2(builder -> builder.bucket(bucket).prefix(listPrefix()).maxKeys(1));
        return !listed.contents().isEmpty() || !listed.commonPrefixes().isEmpty();
    }

    private boolean objectExists() {
        try {
            s3Client.headObject(builder -> builder.bucket(bucket).key(objectKey()));
            return true;
        } catch (NoSuchKeyException exception) {
            return false;
        } catch (S3Exception exception) {
            if (exception.statusCode() == 404) {
                return false;
            }
            throw exception;
        }
    }

    private void loadMetadata() {
        if (metadataKnown) {
            return;
        }
        try {
            var head = s3Client.headObject(builder -> builder.bucket(bucket).key(objectKey()));
            size = head.contentLength() == null ? -1 : head.contentLength();
            lastModified = head.lastModified() == null ? 0 : head.lastModified().toEpochMilli();
        } catch (S3Exception exception) {
            if (exception.statusCode() == 404) {
                size = -1;
            } else {
                throw exception;
            }
        }
        metadataKnown = true;
    }

    private String listPrefix() {
        if ("/".equals(normalizedPath())) {
            return keyPrefix;
        }
        return objectKey() + "/";
    }

    private String objectKey() {
        String normalized = normalizedPath();
        if ("/".equals(normalized)) {
            return keyPrefix.isEmpty() ? "" : keyPrefix.substring(0, keyPrefix.length() - 1);
        }
        return keyPrefix + normalized.substring(1);
    }

    private String ftpPath(String key) {
        String relative = !keyPrefix.isEmpty() && key.startsWith(keyPrefix) ? key.substring(keyPrefix.length()) : key;
        if (relative.endsWith("/")) {
            relative = relative.substring(0, relative.length() - 1);
        }
        return relative.isEmpty() ? "/" : "/" + relative;
    }

    private String normalizedPath() {
        if (path == null || path.isBlank() || ".".equals(path)) {
            return "/";
        }
        String value = path.replace('\\', '/');
        if (!value.startsWith("/")) {
            value = "/" + value;
        }
        while (value.contains("//")) {
            value = value.replace("//", "/");
        }
        if (value.length() > 1 && value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    @Override
    public boolean setLastModified(long time) {
        return false;
    }

    @Override
    public Object getPhysicalFile() {
        return null;
    }

    @Override
    public boolean mkdir() {
        return false;
    }

    @Override
    public boolean delete() {
        return false;
    }

    @Override
    public boolean move(FtpFile destination) {
        return false;
    }
}
