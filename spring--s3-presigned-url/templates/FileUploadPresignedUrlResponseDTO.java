package com.example.common.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class FileUploadPresignedUrlResponseDTO {
    /** The presigned PUT URL the client uses to upload the file directly to S3. */
    private String presignedUrl;

    /** The S3 object key the file will be stored under. */
    private String key;

    /**
     * The full S3 object URL where the file is accessible after upload
     * (e.g. https://bucket.s3.region.amazonaws.com/uploads/2026/06/uuid/photo.png).
     * Persist this value as the canonical location of the uploaded file.
     */
    private String fileUrl;

    /** Expiry time of the presigned URL in seconds. */
    private long expiresInSeconds;
}
