---
name: spring--s3-presigned-url
description: >-
  Add a direct-to-S3 presigned-URL upload capability to a Spring Boot project: an
  AwsS3Service that mints time-limited PUT URLs via S3Presigner (object key
  uploads/YYYY/MM/uuid/filename, Content-Type left unsigned so the client sets the real
  MIME type), a POST /files/presigned-urls controller that accepts a batch of file
  descriptors and returns presigned URLs plus permanent S3 object URLs, the request/
  response DTOs, an app.s3 @ConfigurationProperties binding, and the AWS SDK s3 pom +
  YAML snippets. Use when adding direct browser/client uploads to S3, generating S3
  presigned PUT URLs, wiring S3Presigner, or building a file-upload endpoint that
  bypasses the backend for the file payload.
---

# S3 Presigned-URL Upload Scaffold

Adds **direct client-to-S3 uploads** to a Spring Boot app. The backend only mints a
short-lived presigned `PUT` URL; the client uploads the bytes straight to S3, then
stores the permanent `fileUrl` against whatever domain record owns the file.

Extracted from `web.sales`'s `AwsS3Service` / `FileUploadController` so it is reusable
across any echarge service — including the skeleton produced by
`spring--init-web-project`.

## Mandatory Trigger

Invoke this skill before writing S3 code when the user asks to:

- "add S3 uploads" / "presigned URL upload" / "direct-to-S3 file upload".
- "generate a presigned PUT URL" / "wire S3Presigner".
- "file upload endpoint that returns a presigned URL".
- "app.s3 presigned url" / "AwsS3Service".

## What it produces

Place each template under the project's source root, renaming `com.example` to the
project's base package. The layout matches the `spring--init-web-project` skeleton so
this composes cleanly onto it.

```
src/main/java/com/example/
  common/configurations/aws/
    S3Properties.java            ← templates/S3Properties.java   (skip if present)
    AwsConfiguration.java        (enables S3Properties — skip if present)
  app/services/
    AwsS3Service.java            ← templates/AwsS3Service.java
  common/dto/request/
    FileUploadPresignedUrlRequestDTO.java   ← templates/...RequestDTO.java
  common/dto/response/
    FileUploadPresignedUrlResponseDTO.java  ← templates/...ResponseDTO.java
  controller/
    FileUploadController.java    ← templates/FileUploadController.java
src/main/resources/application.yml   ← merge templates/application.snippet.yml
pom.xml                              ← merge templates/pom.snippet.xml
```

## How to use

1. **Rename the placeholder.** In every template, replace `com.example` with the
   project's base package (e.g. `com.echarge.fleet`). Keep the sub-package layout.

2. **Skip what already exists.** If `S3Properties.java` and/or `AwsConfiguration.java`
   already exist (the `spring--init-web-project` skeleton ships both), do not overwrite
   them — just confirm they expose `bucket`, `region`, and
   `presignedUrlExpiryMinutes` (they do).

3. **Merge the pom snippet.** Add the AWS SDK `s3` dependency from
   `templates/pom.snippet.xml`. If the project has no AWS BOM, also import the BOM (or
   pin an explicit `software.amazon.awssdk:s3` version — 2.29.0 matches the reference).

4. **Merge the YAML snippet.** Add the `app.s3` block from
   `templates/application.snippet.yml` (bucket, region, expiry). Point it at the real
   bucket per environment via `S3_BUCKET` / `S3_REGION` env vars.

5. **Auth (optional).** `FileUploadController` is annotated `@AccessToken` (from
   `user.authentication`), so only authenticated users can mint URLs. If the project
   does not depend on `user.authentication`, delete the `@AccessToken` import and the
   `@AccessToken` line on the controller.

6. **Run & hit it.** `POST /files/presigned-urls` with a JSON body:
   ```json
   [{"filename":"photo.png","contentType":"image/png"}]
   ```
   Each item returns `{presignedUrl, key, fileUrl, expiresInSeconds}`. Upload the file
   with `PUT <presignedUrl>` (set the real `Content-Type` if you passed one), then store
   `fileUrl` on the owning record.

## Notes

- **Unsigned Content-Type.** The presigned `PUT` request is built **without**
  `.contentType(...)`, so the client may send the file's actual MIME type (e.g.
  `image/png`) without breaking the signature. S3 stores whatever Content-Type the
  client provides.
- **Object key shape.** `uploads/{HK-year}/{MM}/{uuid}/{sanitized-filename}` — the
  year/month are computed in `Asia/Hong_Kong` to match the reference's partitioning
  convention. The filename is sanitised (`[^A-Za-z0-9.\\-]+` → `_`).
- **`fileUrl` is the public object URL.** It is the value to persist as the file's
  canonical location. The bucket's actual public-read setting governs whether it is
  fetchable without credentials.
- **`S3Presigner` is built once** in the `AwsS3Service` constructor from the configured
  region; credentials come from the default AWS credentials provider chain (env / profile
  / instance role). No static keys in config.

## Verify

- `POST /files/presigned-urls` `[{"filename":"a.txt"}]` returns 200 with a non-empty
  `presignedUrl`, `key`, `fileUrl`, and `expiresInSeconds` (= `app.s3.presigned-url-expiry-minutes` × 60).
- A raw `PUT` to that `presignedUrl` with a body succeeds (HTTP 200) and the object
  appears in the bucket under `uploads/YYYY/MM/<uuid>/a.txt`.
- Without a valid access token (when `@AccessToken` is kept), the endpoint returns 401.

## Dependencies

Requires the AWS SDK v2 `s3` artifact (`software.amazon.awssdk:s3`; `S3Presigner` ships
in it), Lombok, springdoc (for the `@Tag`/`@Operation` annotations), and the project's
existing `APIResponseDTO` envelope. `@AccessToken` requires `user.authentication`
(optional — see step 5).
