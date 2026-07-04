package com.example.app.services;

import com.example.common.configurations.aws.S3Properties;
import com.example.common.dto.response.FileUploadPresignedUrlResponseDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * Service for generating AWS S3 presigned URLs for direct client-to-S3 file uploads.
 * <p>
 * Equivalent to the Node.js {@code @aws-sdk/s3-request-presigner} +
 * {@code @aws-sdk/client-s3} pattern: generates a time-limited PUT URL that
 * the frontend uses to upload files with {@code Content-Type: application/octet-stream}.
 */
@Service
public class AwsS3Service {

    private static final Logger log = LoggerFactory.getLogger(AwsS3Service.class);

    private final S3Properties s3Properties;
    private final S3Presigner s3Presigner;

    public AwsS3Service(S3Properties s3Properties) {
        this.s3Properties = s3Properties;
        this.s3Presigner = S3Presigner.builder()
                .region(Region.of(s3Properties.getRegion()))
                .build();
    }

    /**
     * Generates a presigned PUT URL that allows the frontend to upload a file
     * directly to S3.
     * <p>
     * No {@code Content-Type} is set on the presigned request, so the client
     * is free to send the file's actual MIME type (e.g. {@code image/png})
     * without breaking the signature.  S3 stores whatever Content-Type the
     * client provides.
     * <p>
     * The S3 object key is generated as: {@code uploads/{year}/{month}/{uuid}/{originalFilename}}
     *
     * @param originalFilename the original filename from the client
     * @return DTO containing the presigned URL, S3 key, public file URL, and expiry
     */
    public FileUploadPresignedUrlResponseDTO generatePresignedUploadUrl(String originalFilename) {
        // Build a unique, predictable S3 key: uploads/YYYY/MM/uuid/filename
        var now = Instant.now();
        var hkZone = java.time.ZoneId.of("Asia/Hong_Kong");
        String year = String.valueOf(java.time.YearMonth.from(now.atZone(hkZone)).getYear());
        String month = String.format("%02d", now.atZone(hkZone).getMonthValue());
        String uuid = UUID.randomUUID().toString();
        String sanitizedFilename = sanitizeFilename(originalFilename);
        String key = String.format("uploads/%s/%s/%s/%s", year, month, uuid, sanitizedFilename);

        Duration expiry = Duration.ofMinutes(s3Properties.getPresignedUrlExpiryMinutes());

        // No .contentType(...) — leaves Content-Type unsigned so the client
        // can use the file's real MIME type without signature mismatch.
        PutObjectRequest objectRequest = PutObjectRequest.builder()
                .bucket(s3Properties.getBucket())
                .key(key)
                .build();

        PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
                .signatureDuration(expiry)
                .putObjectRequest(objectRequest)
                .build();

        PresignedPutObjectRequest presignedRequest = s3Presigner.presignPutObject(presignRequest);

        String presignedUrl = presignedRequest.url().toString();
        String fileUrl = String.format("https://%s.s3.%s.amazonaws.com/%s",
                s3Properties.getBucket(), s3Properties.getRegion(), key);

        log.info("Generated presigned PUT URL for key={}, expires in {} minutes", key,
                s3Properties.getPresignedUrlExpiryMinutes());

        return FileUploadPresignedUrlResponseDTO.builder()
                .presignedUrl(presignedUrl)
                .key(key)
                .fileUrl(fileUrl)
                .expiresInSeconds(expiry.toSeconds())
                .build();
    }

    /**
     * Sanitizes the filename: replaces sequences of non-alphanumeric, non-dot,
     * non-hyphen characters with a single underscore to produce a safe S3 key
     * segment.
     */
    private String sanitizeFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            return "unnamed";
        }
        return filename.replaceAll("[^a-zA-Z0-9.\\-]+", "_");
    }
}
