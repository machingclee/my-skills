---
name: spring--aws-ses
description: >-
  Add a reusable Amazon SES outbound-mail layer to a Spring Boot project: an
  AwsSesConfig that builds a SesClient (SDK v2) from the default credentials
  chain, an AwsSesService that sends plain-text / HTML mail with optional CC /
  BCC and CC-exclusion, the software.amazon.awssdk:ses pom snippet, app.ses YAML
  (region, from-address, cc-addresses), and Lambda IAM (ses:SendEmail,
  ses:SendRawEmail). Use when adding SES email, wiring SesClient, sending
  transactional mail from Spring, or scaffolding AwsSesService / AwsSesConfig.
---

# AWS SES Outbound Mail Scaffold

Adds a **thin Amazon SES wrapper** to a Spring Boot app: a `SesClient` bean plus
`AwsSesService` that sends transactional mail (`sendText` / `send` with optional
HTML, BCC, and CC-exclusion). Credentials come from the **default provider chain**
(env / profile locally, Lambda execution role in AWS) — no static keys in config.

Extracted from `comment-system`'s `AwsSesService` / `AwsSesConfig`. Domain
notification templates (comment-reply HTML) are **not** part of this skill — only
the reusable SES layer.

## Mandatory Trigger

Invoke this skill **before writing SES code** when the user asks to:

- "add SES" / "Amazon SES" / "send email from Spring" / "transactional email".
- "wire SesClient" / "AwsSesService" / "AwsSesConfig".
- "app.ses from-address" / "SES notification mail".
- Scaffold outbound mail in another Spring Boot project using this pattern.

Do **not** copy comment-system's `SendCommentGotRepliedNotificationCommandHandler`
or its HTML templates — those are domain-specific.

## Inputs (collect before generating)

Ask or infer. Do not invent a From address or region.

| Input | Meaning | Example / default |
|---|---|---|
| `basePackage` | project base package | `com.example.fleet` |
| `sesRegion` | AWS region where the SES identity is verified | `ap-northeast-1` (reference default) |
| `fromAddress` | verified SES identity (email **or** any address on a verified domain) | `noreply@example.com` |
| `ccAddresses` | optional comma-separated addresses always CC'd on every send | `owner@example.com` or empty |
| `targetLayout` | where to drop the Java files | see layout below |
| `isLambda` | whether the app deploys as Lambda / Serverless | if `serverless.yml` exists → yes |

**SES prerequisites the agent must surface (do not skip):**

1. `fromAddress` must already be a **verified SES identity** in `sesRegion`
   (email identity, or a domain identity such as `example.com`).
2. Region on `SesClient` **must match** the region where that identity was
   verified. A mismatch yields `MessageRejected` / `Email address not verified`.
3. While the AWS account is in the **SES sandbox**, every To / CC / BCC
   recipient must also be a verified identity (or the account must be moved
   out of sandbox).
4. Locally: `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_PROFILE` /
   `~/.aws/credentials` via `DefaultCredentialsProvider`. On Lambda: the
   execution role (IAM snippet below). **Never** put access keys in YAML.

If `fromAddress` or `sesRegion` is unknown, **stop and ask** — do not guess a
production From address.

## What it produces

Place each template under the project's source root, replacing
`{{basePackage}}` with the real base package.

Preferred drop-in (keep both classes in one package so the unit is copy-pasteable):

```
src/main/java/{{basePackage}}/common/aws/ses/
  AwsSesConfig.java      ← templates/AwsSesConfig.java
  AwsSesService.java     ← templates/AwsSesService.java
src/main/resources/application.yml   ← merge templates/application.snippet.yml
pom.xml                              ← merge templates/pom.snippet.xml
serverless.yml                       ← merge templates/iam.snippet.yml (Lambda only)
```

If the project already has `common/configurations/aws/` (e.g. from
`spring--web-project` / `spring--s3-presigned-url`), put `AwsSesConfig` there
and `AwsSesService` next to other app services (`app/services/` or
`context/external/`). Keep the two classes on the same component-scan.

**Skip if present.** Do not overwrite an existing `AwsSesConfig` / `AwsSesService`
/ `SesClient` `@Bean`. If a `SesClient` bean already exists, only add
`AwsSesService` and point it at that bean.

## How to use

1. **Resolve inputs.** Confirm `basePackage`, `sesRegion`, `fromAddress`,
   optional `ccAddresses`, and whether this is a Lambda deploy. Grep the
   project for an existing AWS SDK BOM / `SesClient` / `app.ses` block first.

2. **Merge the pom snippet.** Add `software.amazon.awssdk:ses` from
   `templates/pom.snippet.xml`.
   - If the project already imports `software.amazon.awssdk:bom`, **omit**
     `<version>` on the `ses` dependency.
   - Otherwise pin **`2.31.50`** (matches the comment-system reference).
   - Add **only** the `ses` module — not the full SDK uber-jar. Extra AWS
     modules bloat a Lambda package.

3. **Merge the YAML snippet.** Add the `app.ses` block from
   `templates/application.snippet.yml` into `application.yml` (or the active
   profile file). Substitute the real region / From / CC. Prefer env-var
   overrides (`SES_REGION`, `SES_FROM_ADDRESS`, `SES_CC_ADDRESSES`) so
   secrets and per-stage identities are not hardcoded.

4. **Copy the two Java classes.** Replace `{{basePackage}}` in the `package`
   declaration. `AwsSesConfig` exposes `SesClient` with `destroyMethod = "close"`.
   `AwsSesService` is a `@Service` that injects that client.

5. **Exception type.** The reference throws `BadRequestException` (HTTP 400)
   for missing to / subject / body. The template uses
   `IllegalArgumentException` so it does not depend on a project exception.
   If the project already has `BadRequestException` (or similar) mapped to
   400, **swap** the three `throw new IllegalArgumentException(...)` calls
   to that type. Do not add a new exception class just for SES.

6. **IAM (Lambda / Serverless only).** Merge `templates/iam.snippet.yml` into
   `provider.iam.role.statements`. Required actions:
   - `ses:SendEmail`
   - `ses:SendRawEmail`
   Resource `"*"` is what the reference uses (SES does not always accept a
   tidy identity ARN on `SendEmail`). Tighten later if the account requires it.

7. **Call it from domain code** — inject `AwsSesService`, do not call
   `SesClient` from handlers:

   ```java
   String messageId = awsSesService.sendText(
           "user@example.com",
           "Subject",
           "Plain-text body");

   String messageId2 = awsSesService.send(
           "user@example.com",
           "Subject",
           "Plain-text body",
           "<p>HTML body</p>");

   // BCC extra recipients; omit configured CCs that already receive the mail
   String messageId3 = awsSesService.send(
           "user@example.com",
           "Subject",
           "Plain-text body",
           "<p>HTML body</p>",
           List.of("bcc@example.com"),
           Set.of("user@example.com"));  // lowercase emails in ccExclusions
   ```

   `send(...)` returns the SES **message id**. `SesException` is logged and
   rethrown — callers decide whether to fail the request or swallow.

8. **Lombok.** `AwsSesService` uses `@RequiredArgsConstructor`. The project
   must already compile Lombok (Spring Boot parent manages it). If the project
   has no Lombok, replace the annotation with an explicit constructor taking
   `SesClient`.

## Behaviour the agent must preserve

- **From** = `app.ses.from-address` (required; no default).
- **CC** = `app.ses.cc-addresses` (optional, comma-separated). Blanks, the To
  recipient, and `ccExclusions` (compared case-insensitively) are dropped so
  the sender is never CC'd on their own mail.
- **Charset** is `UTF-8` on subject and both body parts.
- Body may be text-only, HTML-only, or both. At least one of text/HTML is
  required.
- `SesClient` region defaults to `ap-northeast-1` if `app.ses.region` is
  omitted — **override** this to the identity's real region.
- `proxyBeanMethods = false` on `@Configuration`; bean `destroyMethod = "close"`.

## What this skill does **not** include

- Comment-thread recipient resolution / HTML email templates (that lives in
  `SendCommentGotRepliedNotificationCommandHandler` — domain, not SES).
- Spring Mail (`JavaMailSender`) / SMTP. This is SDK v2 `SesClient.sendEmail`,
  not `spring-boot-starter-mail`.
- SES v2 API (`sesv2` / `SesV2Client`). The reference uses classic
  `software.amazon.awssdk:ses` (`SesClient`).
- Bounce / complaint handling, Configuration Sets, or templates stored in SES.

## Verify

- App starts: `SesClient` bean is created; no failure on missing AWS keys
  until the first send (client construction does not call SES).
- A send to a verified sandbox recipient returns a non-blank message id and
  logs `SES email sent messageId=...`.
- Missing to / subject / both bodies throws before any AWS call.
- With `app.ses.cc-addresses` set to the same address as To, that address is
  **not** duplicated on CC.
- Lambda (if applicable): role can `ses:SendEmail` in `sesRegion`. A missing
  IAM action surfaces as `AccessDenied` from SES, not as a Spring wiring error.

## Dependencies

| Artifact | Why |
|---|---|
| `software.amazon.awssdk:ses` `2.31.50` | `SesClient`, `SendEmailRequest`, `SesException` |
| `spring-boot-starter` (web or not) | `@Service`, `@Configuration`, `@Value` / `@Bean` |
| Lombok (optional) | `@RequiredArgsConstructor` on `AwsSesService` |
| SLF4J | already transitive from Spring Boot |

No Spring Mail, no `sesv2`, no AWS BOM required (BOM is optional hygiene).
