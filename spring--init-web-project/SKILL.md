---
name: spring--init-web-project
description: >-
  Bootstrap a runnable Spring Boot web-app skeleton from a reference project:
  copy the curated generic infrastructure (read/write routing DataSource, JPA config,
  Spring Security + CORS, @LogRequest AOP logger, @AllowFormData resolver, global
  exception handler, APIResponseDTO envelope, SpringContext, scheduler, actuator +
  Prometheus), drop every domain-specific controller/entity/DTO/context/service, and
  emit a trimmed pom.xml + application.yml wired to the user.authentication auth
  library, plus a sample GET /ping controller and a MockMvc smoke test. Use when
  starting a new Spring Boot microservice/web app, scaffolding the shared web layer
  for a Spring Boot module, or bootstrapping a project shell before adding domain
  contexts.
---

# Web Project Scaffold

This skill bootstraps a **runnable Spring Boot web-app skeleton** that mirrors the
generic infrastructure proven in a reference project — minus all domain-specific
code. The result compiles, boots (with `ddl-auto: none`, before any domain tables
exist), and answers `GET /ping`.

Domain command/event/policy contexts and the S3 upload service are added later by
their own skills — this skeleton intentionally carries **only the shared web layer**.

## Mandatory Trigger

Invoke this skill before writing any project/bootstrap code when the user asks to:

- "scaffold a new Spring Boot web project" / "init a microservice" / "create a web app shell".
- "set up the shared web layer" / "web skeleton" for a new module.
- "bootstrap a project" before adding domain contexts (the command/event/policy skill
  expects this skeleton to already exist).

## Inputs

Collect (or infer) before generating:

| Input | Meaning | Example / default |
|---|---|---|
| `targetDir` | where to create the project | `/…/java-modules/web.fleet` |
| `basePackage` | project base package | `com.example.fleet` |
| `artifactId` | Maven artifactId | `web.fleet` |
| `App` | main class name prefix (PascalCase) | `Fleet` → `FleetApplication` |
| `referenceRoot` | root directory of the reference project | `/…/java-modules/web.ref` |
| `referencePackage` | base package of the reference project | `com.example.ref` |

`referenceRoot` and `referencePackage` have no defaults — ask the user when they are
not obvious from context. Confirm `<referenceRoot>/src/main/java/<referencePackage as path>`
exists before copying.

## What it produces

```
<targetDir>/
  pom.xml                                  ← templates/pom.xml
  src/main/java/<basePackage>/
    <App>Application.java                  ← templates/Application.java
    common/aop/formdata/{annotation,config,resolver}/…
    common/aop/logging/{LogRequest,LogRequestAspect}.java
    common/configurations/application/SchedulerConfiguration.java
    common/configurations/aws/{AwsConfiguration,S3Properties}.java
    common/configurations/dbconnection/{datasource,jpa,monitoring}/…
    common/configurations/web/{SecurityConfiguration,WebMvcConfig,LoginSuccessHandler}.java
    common/dto/APIResponseDTO.java
    common/exception/{GlobalExceptionHandler,EcapiException}.java
    common/interceptor/{LogInvocation,LoggingHandlerInterceptor}.java
    common/jpa/QueryLogger.java
    common/springcontext/SpringContext.java
    controller/PingController.java         ← templates/PingController.java
  src/main/resources/application.yml       ← templates/application.yml
  src/test/java/<basePackage>/controller/PingControllerTest.java   ← templates/PingControllerTest.java
```

## How to use

1. **Confirm the reference.** Verify `<referenceRoot>/src/main/java/<referencePackage as path>`
   exists; abort with a clear message if not (ask the user for the correct `referenceRoot`).

2. **Copy the curated infra files.** The exact list of source paths to copy is in
   `templates/include-list.txt` (relative to `<referenceRoot>/src/main/java/<referencePackage as path>/`,
   plus the main class). Copy each into the matching path under
   `<targetDir>/src/main/java/<basePackage>/`, preserving the package sub-tree.

3. **Rename the package.** In every copied file, replace `<referencePackage>` →
   `<basePackage>` (package declarations + all imports). Rename the main class file
   `SystemApplication.java` → `<App>Application.java` and the class inside it to
   `<App>Application` (keep `@EnableScheduling @EnableAsync @SpringBootApplication`).

4. **Fix the two JPA strings.** In `JpaConfiguration.java`:
   - `@EnableJpaRepositories(basePackages = "<referencePackage>.common.jpa.repository")` →
     `<basePackage>.common.jpa.repository`
   - `setPackagesToScan("<referencePackage>.common.jpa.entity.sales")` →
     `setPackagesToScan("<basePackage>.common.jpa.entity")` (drop any domain-specific
     trailing segment so entities from any future context resolve).

5. **Drop in the generated files.** Write `templates/pom.xml`, `templates/application.yml`,
   `templates/Application.java`, `templates/PingController.java`, and
   `templates/PingControllerTest.java`, substituting `{{basePackage}}`, `{{artifactId}}`,
   `{{App}}`, and `{{context}}` (the last package segment of `basePackage`).

6. **Excluded by design — do NOT copy** from the reference project:
   `controller/*` (domain controllers), `context/*` (command/event/policy — added via
   `spring--init-command-event-policy`), `common/dto/request/*` + `common/dto/response/*`
   (domain DTOs), `common/jpa/entity/*`, `common/jpa/repository/*`,
   `common/jpa/DTOMapper.java` (MapStruct mapper), `common/domainutils/*` (domain.util glue,
   added via the command/event/policy skill), `app/services/*` (`AwsS3Service` →
   `spring--s3-presigned-url`; the rest is domain), `applicationrunner/*`,
   `src/main/resources/email_templates/*`.

7. **Run & hit it.** `mvn -f <targetDir> spring-boot:run`, then `GET /ping`.

## Notes

- **Depends on the auth library.** The generated `pom.xml` references
  `{{basePackage}}:user.authentication:1.0.0` (produced by `spring--init-user-authentication`).
  Install that module first (`mvn -f user.authentication install`), or temporarily drop
  the dependency + the `@AccessToken`-using files until it's available. Without it the
  skeleton still compiles — `@AccessToken`/`@RequestUser` are only referenced by domain
  controllers you add later, not by the skeleton itself.
- **Spring Boot version skew.** The reference project may target a different Spring Boot /
  Java version than `user.authentication`. The skeleton inherits the reference project's
  Boot parent. If the auth library misbehaves at runtime, align `user.authentication` to
  the consumer's Boot version.
- **`ddl-auto: none`.** The skeleton boots with no domain tables. Repositories/entities
  added later (via the command/event/policy skill or by hand) must create their own
  tables; do not switch to `validate` until those tables exist.
- **Two `PasswordEncoder` beans.** `SecurityConfiguration` defines a BCrypt encoder and
  `user.authentication` defines a `@Primary` SHA-512 encoder. The `@Primary` one wins on
  injection; this matches the original reference project behaviour.
- **`app.datasource` is required to boot.** `application.yml` ships localhost defaults so
  the routing DataSource initialises; point `app.datasource.write/read.urls` at real DBs
  per profile.

## Verify

- `mvn -f <targetDir> -q compile` exits clean.
- `mvn -f <targetDir> spring-boot:run` starts the app (no domain tables needed).
- `GET /ping` → `{"success":true,"errorCode":"","errorDescription":"","result":"pong"}`.
- `PingControllerTest` passes (`@SpringBootTest` + MockMvc, expects HTTP 200).

## Dependencies

Requires Spring Boot parent (inherited from the reference project), `spring-boot-starter-{web,
security,jdbc,data-jpa,validation,actuator,thymeleaf}`, AspectJ, MySQL Connector/J, MapStruct +
Lombok, springdoc, micrometer-prometheus, and `{{basePackage}}:user.authentication` (see above).
Jakarta namespace throughout.
