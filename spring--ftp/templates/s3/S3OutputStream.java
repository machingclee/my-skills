package {{basePackage}}.ftp.s3;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CompletedMultipartUpload;
import software.amazon.awssdk.services.s3.model.CompletedPart;
import software.amazon.awssdk.services.s3.model.CreateMultipartUploadResponse;
import software.amazon.awssdk.services.s3.model.UploadPartRequest;

import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class S3OutputStream extends OutputStream {

    private static final Logger log = LoggerFactory.getLogger(S3OutputStream.class);
    private static final int PART_SIZE = 5 * 1024 * 1024;

    private final S3Client s3Client;
    private final String bucket;
    private final String key;
    private final AfterUpload afterUpload;

    private final String uploadId;
    private final List<CompletedPart> parts = new ArrayList<>();
    private final byte[] buffer = new byte[PART_SIZE];
    private int pos = 0;
    private int partNumber = 0;
    private long totalBytes = 0;
    private boolean closed;

    public S3OutputStream(S3Client s3Client, String bucket, String key, AfterUpload afterUpload) {
        this.s3Client = s3Client;
        this.bucket = bucket;
        this.key = key;
        this.afterUpload = afterUpload;

        CreateMultipartUploadResponse response = s3Client.createMultipartUpload(b -> b.bucket(bucket).key(key));
        this.uploadId = response.uploadId();
        log.info("S3 multipart upload started: uploadId={} key={}", uploadId, key);
    }

    @Override
    public void write(int b) throws IOException {
        buffer[pos++] = (byte) b;
        totalBytes++;
        if (pos == buffer.length) {
            flushPart();
        }
    }

    @Override
    public void write(byte[] b, int off, int len) throws IOException {
        totalBytes += len;
        int remaining = buffer.length - pos;

        if (len <= remaining) {
            System.arraycopy(b, off, buffer, pos, len);
            pos += len;
            return;
        }

        System.arraycopy(b, off, buffer, pos, remaining);
        pos = buffer.length;
        flushPart();

        int directLen = len - remaining;
        if (directLen >= buffer.length) {
            uploadPart(b, off + remaining, directLen);
            return;
        }
        System.arraycopy(b, off + remaining, buffer, 0, directLen);
        pos = directLen;
    }

    @Override
    public void close() throws IOException {
        if (closed) {
            return;
        }
        closed = true;
        try {
            if (pos > 0) {
                uploadPart(buffer, 0, pos);
            }

            var response = s3Client.completeMultipartUpload(b -> b
                    .bucket(bucket)
                    .key(key)
                    .uploadId(uploadId)
                    .multipartUpload(CompletedMultipartUpload.builder().parts(parts).build()));
            log.info("S3 upload complete: key={} totalBytes={} eTag={}", key, totalBytes, response.eTag());
        } catch (Exception e) {
            log.error("S3 upload failed: key={}", key, e);
            s3Client.abortMultipartUpload(b -> b.bucket(bucket).key(key).uploadId(uploadId));
            throw new IOException("S3 upload failed for key=" + key, e);
        }
        if (afterUpload != null) {
            afterUpload.complete(totalBytes);
        }
    }

    @FunctionalInterface
    interface AfterUpload {
        void complete(long totalBytes) throws IOException;
    }

    private void flushPart() throws IOException {
        if (pos > 0) {
            uploadPart(buffer, 0, pos);
            pos = 0;
        }
    }

    private void uploadPart(byte[] data, int off, int len) throws IOException {
        partNumber++;
        var response = s3Client.uploadPart(
                UploadPartRequest.builder()
                        .bucket(bucket)
                        .key(key)
                        .uploadId(uploadId)
                        .partNumber(partNumber)
                        .build(),
                RequestBody.fromBytes(Arrays.copyOfRange(data, off, off + len)));
        parts.add(CompletedPart.builder()
                .partNumber(partNumber)
                .eTag(response.eTag())
                .build());
    }
}
