package com.example.controller;

import com.example.app.services.AwsS3Service;
import com.example.common.dto.APIResponseDTO;
import com.example.common.dto.request.FileUploadPresignedUrlRequestDTO;
import com.example.common.dto.response.FileUploadPresignedUrlResponseDTO;
// NOTE: drop the @AccessToken import + annotation below if this project does not
// depend on the user.authentication auth library.
import com.example.common.authentication.annotation.AccessToken;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@AccessToken
@Tag(name = "00 File Upload", description = "Endpoints for direct-to-S3 file uploads")
@RequestMapping("/files")
@RequiredArgsConstructor
public class FileUploadController {

    private final AwsS3Service awsS3Service;

    /**
     * Generates presigned S3 PUT URLs for a batch of files.
     * <p>
     * Each item produces a presigned URL and the permanent S3 {@code fileUrl}.
     * The frontend uploads each file directly to S3, then stores the
     * {@code fileUrl} on whatever domain record owns the file.
     */
    @PostMapping("/presigned-urls")
    @Operation(summary = "Generate presigned S3 upload URLs for multiple files",
            description = "Accepts a list of file descriptors (filename, optional contentType) and returns a list of presigned PUT URLs with the permanent S3 object URLs. The frontend uploads each file directly to S3 and persists the returned fileUrl.")
    public APIResponseDTO<List<FileUploadPresignedUrlResponseDTO>> generatePresignedUrls(
            @RequestBody List<FileUploadPresignedUrlRequestDTO> files) {
        List<FileUploadPresignedUrlResponseDTO> results = files.stream()
                .map(f -> awsS3Service.generatePresignedUploadUrl(f.getFilename()))
                .toList();
        return APIResponseDTO.success(results);
    }
}
