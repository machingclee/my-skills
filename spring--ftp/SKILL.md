---
name: spring--ftp
description: >-
  Wire the com.echarge:web.ftp library into a Spring Boot service so an embedded
  Apache FtpServer streams uploads to S3 and serves listing and download from one
  prefix. The server starts only when the service declares one FTPS3Configuration
  bean. Use when adding FTP to a Spring Boot app, exposing a passive data port,
  implementing preUpload, postUpload, preDownload, or postDownload, or changing
  the web.ftp module.
---

# Spring FTP to S3

`web.ftp` embeds Apache FtpServer 1.2.1 in a Spring Boot process and stores files in S3. The library does not read YAML and does not persist anything. A service turns FTP on by declaring one `@Component` that extends `com.echarge.ftp.FTPS3Configuration` and passes every setting into `super`.

Reference library: `/Users/chingcheonglee/Repos/hkev/java-modules/web.ftp`. Package `com.echarge.ftp`. S3 types stay in `com.echarge.ftp.s3`. Working consumer: `web.ecapi3` class `com.echarge.ecapi3.common.configurations.ftp.FTPConfig`, settings in `application-dev.yml` under `app.ftp`. `web.sales` does not use this module.

## Mandatory Trigger

Invoke this skill before writing FTP or `web.ftp` code when the user asks to:

- add an FTP server, FTP upload, or FTP download to a Spring Boot service
- stream an FTP `STOR` into S3
- list or download files that were uploaded through this FTP server
- implement `preUpload`, `postUpload`, `preDownload`, or `postDownload`
- open the FTP data port, or host this FTP server on EC2
- change `FTPS3Configuration`, `FtpServerLifecycle`, or the `web.ftp` pom

## Add It to a Service

1. Depend on the library. Do not declare `ftpserver-core` or `ftplet-api` again. They arrive transitively from `web.ftp`. The service already has the AWS S3 SDK for its own use. Install the snapshot first with `mvn -q install -DskipTests` inside `web.ftp` when the local Maven repo is stale.

```xml
<dependency>
    <groupId>com.echarge</groupId>
    <artifactId>web.ftp</artifactId>
    <version>0.0.1-SNAPSHOT</version>
</dependency>
```

2. Put every setting in the service's own YAML. The library never binds `app.ftp`.

```yaml
app:
  ftp:
    port: 2121
    data-port: 2122
    bucket: example-ftp-dev
    region: ap-east-1
    prefix: /ftp
    username: ftpuser
    password: ftppw
```

3. Register one bean where component scan can see it. `extends` is required. `FTPS3Configuration` is an abstract class, not an interface. All four methods are abstract. Leave a method empty when that moment needs no side effect. Limit the bean with `@Profile` when only one environment should open the ports, and put `app.ftp` only in that profile's YAML.

```java
@Component
@Profile("dev")
public class FTPConfig extends FTPS3Configuration {

    public FTPConfig(
            @Value("${app.ftp.port}") int port,
            @Value("${app.ftp.data-port}") int dataPort,
            @Value("${app.ftp.bucket}") String bucket,
            @Value("${app.ftp.region}") String region,
            @Value("${app.ftp.prefix}") String prefix,
            @Value("${app.ftp.username}") String username,
            @Value("${app.ftp.password}") String password) {
        super(port, dataPort, bucket, region, prefix, username, password);
    }

    @Override
    public void preUpload(String fileName, String s3Key) throws IOException {
    }

    @Override
    public void postUpload(String fileName, String s3Key, long totalBytes) throws IOException {
    }

    @Override
    public void preDownload(String s3Key, long offset) throws IOException {
    }

    @Override
    public void postDownload(String s3Key, long bytesRead) throws IOException {
    }
}
```

## When the Server Starts

`FtpAutoConfiguration` is registered in `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`. It is `@Profile("!test")`, so a `@SpringBootTest` does not bind `2121` or `2122`.

The `@Bean` method takes `ObjectProvider<FTPS3Configuration>` and calls `getIfAvailable()` while the context refreshes, after component scan has registered the service bean.

- No bean: the factory returns null and no port opens.
- One bean: `FtpServerLifecycle` starts on `ApplicationReadyEvent`.
- Two beans: startup fails with `NoUniqueBeanDefinitionException`.

`FtpServerLifecycle` builds its own `S3Client` from `getRegion()`, then stops the server and closes that client on `DisposableBean.destroy()`.

## Constructor

`super` takes seven arguments, in this order:

- `port`, control connection. Login uses it. `2121` in the example.
- `dataPort`, the single passive data port. `LIST`, `STOR`, and `RETR` use it. `2122` in the example. `FtpServerLifecycle` calls `DataConnectionConfigurationFactory.setPassivePorts` with that integer as a string. One transfer holds the port until it closes.
- `bucket`, the S3 bucket.
- `region`, the S3 region passed to `S3Client.builder().region`.
- `root`, the FTP root as an S3 prefix. `/ftp`, `ftp`, and `ftp/` all become `ftp/`. An empty root lists the whole bucket. Do not leave it empty.
- `username`, the single account.
- `password`, that account's password. Null is stored as an empty password.

The client home is `/`. That path lists and stores only `keyPrefix()`. `..` cannot climb above `/`.

## Handlers

Side effects belong only in the four methods on the service's subclass. Do not add storage, a log table, or a repository inside `web.ftp`. When a transfer needs a record, the service writes it from the handler that already runs at that moment.

- `preUpload(fileName, s3Key)` runs before `createMultipartUpload`. Throwing here skips S3.
- `postUpload(fileName, s3Key, totalBytes)` runs after `completeMultipartUpload` succeeds. A failed upload aborts the multipart upload and does not call `postUpload`.
- `preDownload(s3Key, offset)` runs before `GetObject`.
- `postDownload(s3Key, bytesRead)` runs once, when the download stream closes.

`s3Key` is the real object key, including the prefix. `fileName` is the last path segment, not the key.

## What the Client Sees

S3 has no folders. `S3FileSystemView` owns the working directory, starting at `/`. `PWD`, `CWD`, and `LIST` all go through that view. Do not use `NativeFileSystemView`. Its working directory stays on the local disk, so overriding `getFile` never lists S3.

- `LIST` and `MLSD` call `ListObjectsV2` with delimiter `/` on the prefix for the working directory. `/` lists `ftp/` only.
- A finished upload is not stored at the path the client sent to `STOR`. `createOutputStream` chooses `ftp/<epochMillis>/<fileName>`. After success, `/` shows the timestamp as a directory and that directory shows the file.
- `RETR` calls `GetObject` on the mapped key. A non-zero offset sends `range("bytes=" + offset + "-")`.
- `doesExist()` stays true for a new name so `STOR` reaches `createOutputStream`.
- Children from `ListObjectsV2` carry their directory flag, size, and mtime. Listing does not `HeadObject` each child.
- `226` means the data connection finished. It does not mean any keys were returned.

Nothing in the library builds an `ftp://` link, an HTTP route, or a presigned URL. A download is a client session: plain FTP to port `2121`, then `RETR` of `/<epochMillis>/<fileName>`. Current browsers do not speak FTP. FileZilla and curl do. In FileZilla set Encryption to "Only use plain FTP (insecure)".

```bash
curl --ftp-pasv "ftp://ftpuser:ftppw@host:2121/<epochMillis>/<fileName>" -o "<fileName>"
```

The epoch is chosen when the upload starts. The original file name is not enough to rebuild the path. List `/` first.

## Ports and EC2

`2121` accepts `USER` and `PASS` only. `LIST`, `STOR`, and `RETR` open a second TCP connection on `dataPort`. A security group that allows only `2121` lets the client log in and then fail the transfer. Open both ports, and only from the client address that should be allowed to connect.

The listener does not set `passiveExternalAddress`. On EC2 the passive reply therefore names the instance's private address, which a client on the internet cannot route. Hosting this server for a remote client requires setting that address to the Elastic IP or public DNS on the same `DataConnectionConfigurationFactory`, and opening `2121` and the data port in the security group. Do not add TLS unless the user asks. There is no `SslConfiguration`. `AUTH TLS` returns `431 Service is unavailable`. An HTTP reverse proxy cannot terminate explicit FTPS, because the client speaks cleartext `AUTH TLS` first and then opens a second data connection.

## Login and Reply Codes

`WritePermission` allows `STOR`. It does not authorize login. `BaseUser` also gets `ConcurrentLoginPermission(0, 0)`. For that permission, `0` means unlimited. Without it, `USER` returns `421 Maximum login limit has been reached` even when no session is open. Restart after changing authorities. The running user is the one built at startup.

`STOR` sends `150` before `createOutputStream`. An `IOException` from the stream becomes `551`. A `SocketException` becomes `426`. Any other exception becomes a generic `550 Requested action not taken`, logged as `RequestHandler.service()`.

## IAM

The EC2 role needs these actions on the configured bucket and prefix. `s3:PutObject` does not include listing or download.

- `s3:ListBucket` on the bucket, optionally conditioned to the prefix
- `s3:GetObject`
- `s3:PutObject`
- `s3:CreateMultipartUpload`
- `s3:UploadPart`
- `s3:CompleteMultipartUpload`
- `s3:AbortMultipartUpload`

## Library Rules

`web.ftp` is a library, not a Boot application. Its pom imports `spring-boot-dependencies` `4.0.0` as a BOM and does not use `spring-boot-starter-parent`. It does not apply `spring-boot-maven-plugin`. `spring-boot-autoconfigure` stays optional. `ftpserver-core` `1.2.1` and `software.amazon.awssdk:s3` `2.29.0` stay non-optional so consumers receive them transitively.

IntelliJ treats a module whose pom uses `spring-boot-starter-parent` as a Boot application and does not put that module's dependencies on the runtime classpath of `web.sales` or `web.ecapi3`. That failure looks like `NoClassDefFoundError: org/apache/ftpserver/ftplet/User` even when `mvn dependency:tree` already shows `ftplet-api`. Do not "fix" it by adding `ftpserver-core` to the consumer. Keep the library pom as a plain jar that imports the BOM.

Do not add a second `FTPS3Configuration` bean. Do not make the handlers optional. Do not put a default implementation in the library. Do not point listing at prefix `""`.
