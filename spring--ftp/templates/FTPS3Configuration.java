package {{basePackage}}.ftp;

import java.io.IOException;

public abstract class FTPS3Configuration {

    private final int port;
    private final int dataPort;
    private final String bucket;
    private final String region;
    private final String root;
    private final String username;
    private final String password;
    private final String passiveAddress;

    protected FTPS3Configuration(int port, int dataPort, String bucket, String region, String root, String username, String password, String passiveAddress) {
        this.port = port;
        this.dataPort = dataPort;
        this.bucket = bucket;
        this.region = region;
        this.root = root;
        this.username = username;
        this.password = password;
        this.passiveAddress = passiveAddress;
    }

    public int getPort() {
        return port;
    }

    public int getDataPort() {
        return dataPort;
    }

    public String getBucket() {
        return bucket;
    }

    public String getRegion() {
        return region;
    }

    public String getRoot() {
        return root;
    }

    public String getUsername() {
        return username;
    }

    public String getPassword() {
        return password;
    }

    public String getPassiveAddress() {
        return passiveAddress;
    }

    public String keyPrefix() {
        String value = root == null ? "" : root.trim().replace('\\', '/');
        while (value.startsWith("/")) {
            value = value.substring(1);
        }
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value.isEmpty() ? "" : value + "/";
    }

    public abstract void preUpload(String fileName, String s3Key) throws IOException;

    public abstract void postUpload(String fileName, String s3Key, long totalBytes) throws IOException;

    public abstract void preDownload(String s3Key, long offset) throws IOException;

    public abstract void postDownload(String s3Key, long bytesRead) throws IOException;
}
