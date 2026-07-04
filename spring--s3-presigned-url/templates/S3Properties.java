package com.example.common.configurations.aws;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds {@code app.s3.*} from application YAML.
 * <p>
 * Shipped by spring--init-web-project; this template is provided for projects that do
 * not already have it. If {@code S3Properties} already exists, skip this file.
 */
@ConfigurationProperties("app.s3")
public class S3Properties {

    /** S3 bucket name for file uploads. */
    private String bucket;

    /** AWS region the bucket resides in (e.g. ap-east-1). */
    private String region = "ap-east-1";

    /** Minutes until the presigned URL expires. */
    private int presignedUrlExpiryMinutes = 10;

    public String getBucket() {
        return bucket;
    }

    public void setBucket(String bucket) {
        this.bucket = bucket;
    }

    public String getRegion() {
        return region;
    }

    public void setRegion(String region) {
        this.region = region;
    }

    public int getPresignedUrlExpiryMinutes() {
        return presignedUrlExpiryMinutes;
    }

    public void setPresignedUrlExpiryMinutes(int presignedUrlExpiryMinutes) {
        this.presignedUrlExpiryMinutes = presignedUrlExpiryMinutes;
    }
}
