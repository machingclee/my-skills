---
name: spring--ftp
description: >-
  Initialize a standalone embedded Apache FtpServer inside any Spring Boot
  project. Copies the FTP classes into the application, streams STOR to S3 with
  multipart upload, and serves LIST and RETR from one prefix. The server starts
  only when the project has one FTPConfig bean. Use when adding FTP to a new or
  existing Spring Boot app, opening the passive data port, hosting the server
  on EC2, or implementing preUpload, postUpload, preDownload, or postDownload.
---

# Standalone Spring FTP to S3

Drop an embedded Apache FtpServer into a Spring Boot application. Uploads go to S3. Listing and download read that same prefix back. The templates are the whole server. Do not depend on an internal `web.ftp` artifact, and do not look for one in another repository.

The copied classes do not persist transfers. `FTPConfig` leaves `preUpload`, `postUpload`, `preDownload`, and `postDownload` empty. A project that later needs a record of a transfer writes that record inside those four methods. Do not add storage to `S3FileObject` or `S3OutputStream`.

## Mandatory Trigger

Invoke this skill before writing FTP code when the user asks to:

- initialize, add, or scaffold an FTP server in a Spring Boot project
- stream an FTP upload into S3
- list or download files stored by this FTP server
- implement `preUpload`, `postUpload`, `preDownload`, or `postDownload`
- open the FTP data port, or host this FTP server on EC2

## Inputs

Ask for anything that is still unknown. Do not invent a bucket, region, or password.

| Input | Meaning | Default in the templates |
|---|---|---|
| `basePackage` | package of the `@SpringBootApplication` class | replace `{{basePackage}}` |
| `bucket` | S3 bucket the server reads and writes | `example-ftp-dev` |
| `region` | region of that bucket | `ap-east-1` |
| `prefix` | FTP root, stored as an S3 key prefix | `/ftp` |
| `port` | control port | `2121` |
| `dataPort` | single passive data port | `2122` |
| `username` | the one FTP account | `ftpuser` |
| `password` | that account's password | environment variable `FTP_PASSWORD` |
| `passiveAddress` | public address advertised by PASV | empty locally, Elastic IP or public DNS on EC2 |
| `profile` | Spring profile that should open the ports | `dev` |

## What to Copy

Replace every `{{basePackage}}` with the application's base package, then copy the templates under the source root. `@SpringBootApplication` must scan that package. `FtpAutoConfiguration` is a `@Configuration` in the same tree, so component scan loads it. Do not add an auto-configuration imports file.

```
src/main/java/{{basePackage}}/ftp/
  FTPS3Configuration.java      ← templates/FTPS3Configuration.java
  FtpAutoConfiguration.java    ← templates/FtpAutoConfiguration.java
  FtpServerLifecycle.java      ← templates/FtpServerLifecycle.java
  StaticUserManager.java       ← templates/StaticUserManager.java
  FTPConfig.java               ← templates/FTPConfig.java
  s3/
    S3FileSystemFactory.java   ← templates/s3/S3FileSystemFactory.java
    S3FileSystemView.java      ← templates/s3/S3FileSystemView.java
    S3FileObject.java          ← templates/s3/S3FileObject.java
    S3OutputStream.java        ← templates/s3/S3OutputStream.java
src/main/resources/application.yml   ← merge templates/application.snippet.yml
pom.xml                              ← merge templates/pom.snippet.xml
```

Skip an S3 SDK dependency that the pom already declares. Keep `ftpserver-core` at `1.2.1`. The application needs a Spring Boot starter that brings SLF4J. These classes are part of the application, not a second Boot module.

## YAML and the Bean

Merge `templates/application.snippet.yml` into the profile file that should run FTP. Replace `bucket`, `region`, and `prefix`. Set `FTP_PASSWORD` in the environment. On a laptop leave `passive-address` empty. On EC2 set `FTP_PASSIVE_ADDRESS` to the Elastic IP or public DNS name.

`FTPConfig` is the only class to edit after the copy:

- Change `@Profile("dev")` to the profile that contains `app.ftp`. Remove `@Profile` when every non-test run should listen.
- `FtpAutoConfiguration` is already `@Profile("!test")`. A `@SpringBootTest` does not bind `2121` or `2122`.
- Keep exactly one `FTPS3Configuration` bean. None means the factory returns null and no port opens. Two beans fail startup with `NoUniqueBeanDefinitionException`.
- `extends FTPS3Configuration`. It is an abstract class. All four methods stay implemented, even when the body is empty.

`super` takes eight arguments, in this order: `port`, `dataPort`, `bucket`, `region`, `root`, `username`, `password`, `passiveAddress`.

## Handlers

- `preUpload(fileName, s3Key)` runs before `createMultipartUpload`. Throwing skips S3.
- `postUpload(fileName, s3Key, totalBytes)` runs after `completeMultipartUpload` succeeds. A failed upload aborts the multipart upload and does not call `postUpload`.
- `preDownload(s3Key, offset)` runs before `GetObject`.
- `postDownload(s3Key, bytesRead)` runs once, when the download stream closes.

`s3Key` includes the prefix. `fileName` is the last path segment.

## What the Client Sees

`/` is the prefix from `root`. `/ftp`, `ftp`, and `ftp/` all become the key prefix `ftp/`. An empty root lists the whole bucket. Do not leave it empty. `..` cannot climb above `/`.

`S3FileSystemView` owns the working directory. Do not switch it to `NativeFileSystemView`. That view stays on the local disk, so `LIST` never asks S3.

A finished `STOR` is not stored at the path the client sent. The object key is `<prefix><epochMillis>/<fileName>`. After success, `/` shows the timestamp as a directory and that directory shows the file. `LIST` uses `ListObjectsV2` with delimiter `/` on that prefix only. `RETR` uses `GetObject`. A non-zero offset sends a byte range.

Nothing here builds an `ftp://` link, an HTTP route, or a presigned URL. Download is a plain-FTP session on port `2121`, then `RETR` of `/<epochMillis>/<fileName>`. Current browsers do not speak FTP. FileZilla and curl do. In FileZilla set Encryption to "Only use plain FTP (insecure)". List `/` before constructing a path, because the epoch is chosen when the upload starts.

```bash
curl --ftp-pasv "ftp://ftpuser:${FTP_PASSWORD}@host:2121/<epochMillis>/<fileName>" -o "<fileName>"
```

## Ports and EC2

`2121` is login. `2122` is the one passive port for `LIST`, `STOR`, and `RETR`. One transfer holds `2122` until it closes. A security group that allows only `2121` lets the client log in and then fail the transfer. Open both ports, and only from the client address that should connect.

`FtpServerLifecycle` calls `setPassiveExternalAddress` when `passive-address` is non-blank. Without that value on EC2, the passive reply names the instance's private address and the client cannot route to it.

There is no TLS. `AUTH TLS` returns `431 Service is unavailable`. Do not add `SslConfiguration` unless the user asks. An HTTP reverse proxy cannot terminate explicit FTPS.

## Login and Reply Codes

`WritePermission` allows `STOR`. It does not authorize login. The user also receives `ConcurrentLoginPermission(0, 0)`. For that permission, `0` means unlimited. Without it, `USER` returns `421 Maximum login limit has been reached` even when no session is open.

`STOR` sends `150` before `createOutputStream`. An `IOException` from the stream becomes `551`. A `SocketException` becomes `426`. Any other exception becomes a generic `550 Requested action not taken`, logged as `RequestHandler.service()`. `226` means the data connection finished. It does not mean S3 returned any keys.

## IAM

The instance role needs these actions on the bucket and prefix. `s3:PutObject` does not include listing or download.

- `s3:ListBucket` on the bucket, optionally conditioned to the prefix
- `s3:GetObject`
- `s3:PutObject`
- `s3:CreateMultipartUpload`
- `s3:UploadPart`
- `s3:CompleteMultipartUpload`
- `s3:AbortMultipartUpload`

Credentials come from the default AWS provider chain. Do not put access keys in YAML.

## After the Copy

Run the application's compile. Start the profile that owns `app.ftp` with `FTP_PASSWORD` set. The log line `FTP server started on port 2121 with data port 2122` means both listeners are up. Connect with plain FTP and confirm `LIST` shows only the configured prefix.
