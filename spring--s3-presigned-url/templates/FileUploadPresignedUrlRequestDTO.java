package com.example.common.dto.request;

import lombok.Data;

@Data
public class FileUploadPresignedUrlRequestDTO {
    /** The original filename the client intends to upload. */
    private String filename;

    /**
     * Optional MIME type of the file (e.g. "image/png", "application/pdf").
     * When set, the presigned URL will require the upload to carry this exact
     * Content-Type header. When omitted, the presigned URL does not constrain
     * the Content-Type, so the client may set it to the file's actual type.
     */
    private String contentType;
}
