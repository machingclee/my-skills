---
name: spring--init-user-authentication
description: >-
  Scaffold a self-contained JWT auth library named {{basePackage}}:user.authentication with a
  trimmed UserRole (minimal role set), removal of unused enums and the UserProfileContact
  entity and its composite-key class, matching surgery on the User entity, a corrected JPA
  package-scan in AutoConfiguration, and a pom with the right coordinates. Delivers
  @AccessToken interceptor + @RequestUser argument resolver for AccessTokenPayload injection
  into controller methods, JJWT access/refresh tokens, DynamoDB refresh-token storage, and
  the /auth controller. Use when creating the auth library for a new microservice or
  bootstrapping JWT login/register/logout/refresh.
---

# user.authentication Scaffold

`user.authentication` is a self-contained Spring Boot auto-configuring library that provides
JWT auth: `@AccessToken` interceptor + `@RequestUser` **argument resolver** (injects
`AccessTokenPayload` into controller methods), JJWT access/refresh tokens, a DynamoDB
refresh-token store, an isolated `authEntityManagerFactory`, and a `/auth` controller
(login / register / logout / refresh / authenticate).

This skill produces a properly-named **`{{basePackage}}:user.authentication`** module, with
a **minimal** `UserRole` and the requested enum / entity trimming.

## Inputs

| Input | Meaning | Example / default |
|---|---|---|
| `targetDir` | where to create the module | `/…/java-modules/user.authentication` |
| `basePackage` | project base package | `com.example` |
| `referenceRoot` | optional parent of an existing auth module to copy from | (none — prefer templates) |

If `referenceRoot` is given and contains a usable auth module, copy from it then overlay
templates and renames below. Otherwise scaffold primarily from `templates/` in this skill.
The module name, groupId, artifactId and package are fixed by this skill:
`<basePackage>:user.authentication:1.0.0`, base package `<basePackage>.user.authentication`.

## What it produces

A new Maven library at `<targetDir>/` whose source tree matches the layout below
(templates + any reference copy, after renames and trims).

```
<targetDir>/
  pom.xml                                   ← templates/pom.xml
  src/main/java/<basePackage>/user/authentication/
    Application.java                        (library marker — no main class)
    common/annotation/RequestUser.java      ← parameter annotation for payload injection
    common/authentication/{annotation/AccessToken, crypto/Sha512PasswordEncoder, jwt/JwtUtil, jwt/payload/*}
    common/configuration/{AutoConfiguration, AuthDbProperties, DynamoDbConfiguration, SwaggerConfiguration, WebConfig}
    common/domain/enums/UserRole.java       ← templates/.../UserRole.java (trimmed roles)
    common/domain/model/{UserId, UserInfo}   (UserProfileContactId DELETED)
    common/dto/{request/*, response/*, presentation/*}
    common/exception/{JWTAuthException, JwtAuthExceptionHandler}
    common/infrastructure/dynamodb/{converter, entity, repository}/
    common/interceptor/AccessTokenHandlerInterceptor.java
    common/jpa/entity/User.java             ← EDITED (unused enums & contacts removed)
    common/jpa/repository/UserInfoRepository.java
    common/resolver/RequestUserArgumentResolver.java
    controller/AuthController.java
    service/AuthApplicationService.java
  src/main/resources/
    META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
    application.yml
```

## JWT payload → controller method (argument resolver)

**Do not re-read the `Authorization` header in controllers.** When an endpoint is guarded
by `@AccessToken`, the interceptor validates the Bearer JWT and stores the parsed payload;
a `HandlerMethodArgumentResolver` then injects that payload into any parameter annotated
with `@RequestUser`.

### Pipeline

1. **`@AccessToken`** (type or method) → `AccessTokenHandlerInterceptor` runs.
2. Interceptor parses/validates the JWT into `AccessTokenPayload`, optional role check,
   then `request.setAttribute(AUTH_JWT_PAYLOAD_ATTR, payload)`.
3. **`@RequestUser AccessTokenPayload …`** on a controller parameter →
   `RequestUserArgumentResolver` reads that attribute and returns it.

### Resolver contract (must be preserved when scaffolding)

- `supportsParameter`: parameter has `@RequestUser` **and** type is assignable to
  `AccessTokenPayload`.
- `resolveArgument`: `webRequest.getAttribute(AUTH_JWT_PAYLOAD_ATTR, SCOPE_REQUEST)`.
- `WebConfig.addArgumentResolvers` registers the resolver; `addInterceptors` registers
  the interceptor on `/**`.
- `AutoConfiguration` exposes beans for interceptor, resolver, and `WebConfig`.

### Consumer controller usage

```java
import <basePackage>.user.authentication.common.authentication.annotation.AccessToken;
import <basePackage>.user.authentication.common.annotation.RequestUser;
import <basePackage>.user.authentication.common.authentication.jwt.payload.AccessTokenPayload;
import <basePackage>.user.authentication.common.domain.enums.UserRole;

@AccessToken  // class-level: all methods require a valid access token
@RestController
@RequestMapping("/booking")
public class BookingController {

    // Inject the validated payload — do not parse Authorization here
    @PutMapping("/schedules/{scheduleId}")
    public APIResponseDTO<?> update(
            @RequestBody UpdateDTO body,
            @RequestUser AccessTokenPayload payload
    ) {
        String userId = payload.getUser().getUserId().toString();
        // ...
        return APIResponseDTO.success(null);
    }

    // Role-restricted: method-level @AccessToken(role = …) overrides class-level role list
    @AccessToken(role = {UserRole.ADMINISTRATOR})
    @GetMapping("/admin-only")
    public APIResponseDTO<?> admin(@RequestUser AccessTokenPayload payload) {
        return APIResponseDTO.success(payload);
    }
}
```

Library endpoints that already follow this pattern:

- `GET /auth/authenticate` → `@AccessToken` + `@RequestUser AccessTokenPayload`
- `PUT /auth/logout` → `@AccessToken` + `@RequestUser AccessTokenPayload`
- `GET /auth/refresh-tokens` → `@AccessToken(role = {UserRole.ADMINISTRATOR})`

### Rules for the scaffold agent

- When the auth module (or a consumer) has a JWT **payload type** analogous to
  `AccessTokenPayload`, **always** expose it via a parameter annotation +
  `HandlerMethodArgumentResolver` — never require controllers to call
  `request.getHeader("Authorization")` or re-parse the token.
- If you add another token/payload pair later, mirror the same three pieces:
  interceptor (or shared store of the payload), parameter annotation, argument resolver
  registered in `WebConfig`.
- Keep `AUTH_JWT_PAYLOAD_ATTR` as the single hand-off key between interceptor and resolver.

## How to use

1. **Choose a source.** Prefer scaffolding from this skill’s `templates/` tree. If the user
   supplies a `referenceRoot` with an existing auth module, copy that module into
   `<targetDir>/user.authentication/` first, then overlay the templates listed in step 2
   so interceptor / resolver / annotations stay consistent.

2. **Overlay skill templates for auth web plumbing** (always, so payload injection is
   present even when the reference is incomplete or package layout differs):
   - `templates/.../common/interceptor/AccessTokenHandlerInterceptor.java`
   - `templates/.../common/resolver/RequestUserArgumentResolver.java`
   - `templates/.../common/annotation/RequestUser.java`
   - `templates/.../common/authentication/annotation/AccessToken.java`
   - `templates/.../common/configuration/WebConfig.java`
   - `templates/.../common/exception/JWTAuthException.java` (if missing)
   - other templates under `templates/src/...` as needed (`AutoConfiguration`, `JwtUtil`,
     `UserRole`, `pom.xml`, etc.)

3. **Determine `<basePackage>` and rename the directory tree.** Ask the user for the
   project’s base package (e.g., `com.example`, `com.acme`, `io.mycompany`). Ensure sources
   live under:
   ```
   src/main/java/<basePackage>/user/authentication/…
   ```
   If a reference used a different package root, move the tree accordingly:
   ```bash
   old_pkg_path=$(echo "<referencePackageRoot>" | tr '.' '/')
   new_pkg_path=$(echo "<basePackage>/user/authentication" | tr '.' '/')
   # mv / rename so the final path is src/main/java/<basePackage>/user/authentication/…
   ```

4. **Delete these files** (do not carry them over). Unused enums and the
   `UserProfileContact` relationship are unnecessary — a typical project only needs the
   `User` entity:
   - all unused enum files under `common/domain/enums/` (keep only `UserRole`)
   - `UserProfileContactEntity` (wherever it lives under jpa/entity or infrastructure)
   - `UserProfileContactId` (domain model / composite key)

5. **Edit `common/jpa/entity/User.java`** — remove:
   - any unused enum imports,
   - the `import java.util.ArrayList;` and `import java.util.List;` lines (now unused),
   - the `status` field (its `@Convert` annotation, `@Column`, and field declaration),
   - the `mfa` field (its `@Convert` annotation, `@Column`, and field declaration),
   - the entire relationship block for profile contacts (`@OneToMany` / `contacts` field
     and its entity import).
   - **Keep:** `id`, `password`, `isTest`, `role`, `createDate`, `lastLoginDate`.
   The resulting entity maps `user_info` columns `{id, password, is_test, role,
   create_date, last_login_date}` only.

6. **Replace `common/domain/enums/UserRole.java`** with
   `templates/.../common/domain/enums/UserRole.java` (minimal roles: `ADMINISTRATOR`,
   `USER` — same `dbValue` / `fromDbValue` / `RoleConverter` shape). `ADMINISTRATOR` is
   mandatory because `AuthController.viewRefreshTokens` uses `@AccessToken(role =
   {UserRole.ADMINISTRATOR})`.

7. **Fix `common/configuration/AutoConfiguration.java`** — the
   `authEntityManagerFactory` bean’s `setPackagesToScan(...)` must point at the real
   renamed paths (reference copies often still scan stale packages):
   ```java
   em.setPackagesToScan(
       "<basePackage>.user.authentication.common.jpa.entity",
       "<basePackage>.user.authentication.common.domain.model"
   );
   ```
   Confirm these beans exist and stay wired (payload injection depends on them):
   - `AccessTokenHandlerInterceptor` (`@ConditionalOnBean` JWT util/provider)
   - `RequestUserArgumentResolver`
   - `WebConfig` that registers **both** the interceptor and the argument resolver
     (`addInterceptors` + `addArgumentResolvers`)

8. **Replace `pom.xml`** with `templates/pom.xml` (new coordinates
   `<basePackage>:user.authentication:1.0.0`). Deps are otherwise unchanged (optional
   starters, JJWT api/impl/jackson at compile scope so consumers inherit them, AWS
   DynamoDB + enhanced, springdoc, spring-security-crypto, MySQL, Lombok, domainutil,
   test starter), Java 17, Lombok processor path, AWS BOM in `<dependencyManagement>`.

9. **Replace all package references.** Globally replace the reference’s old package root
   (if any) and every `{{basePackage}}` placeholder with the correct targets:
   ```bash
   find <targetDir>/user.authentication -type f \( -name '*.java' -o -name '*.xml' -o -name '*.yml' -o -name '*.imports' \) \
     -exec sed -i '' \
       -e 's|<referencePackageRoot>|<basePackage>.user.authentication|g' \
       -e 's|com\.example|<basePackage>|g' \
       -e 's|{{basePackage}}|<basePackage>|g' {} +
   ```
   After this sweep:
   - Package declarations + imports → `<basePackage>.user.authentication.…`
   - `pom.xml` → `<groupId><basePackage></groupId>`, `<basePackage>:domainutil` dep
   - `AutoConfiguration.java` → `setPackagesToScan` points at
     `<basePackage>.user.authentication.common.jpa.entity` and
     `<basePackage>.user.authentication.common.domain.model`
   - No leftover `{{basePackage}}` or old reference package strings remain under
     `<targetDir>`.

10. **Ensure AuthController uses the resolver for payload parameters.** After rename,
    `authenticate` / `logout` must look like:
    ```java
    @AccessToken
    @GetMapping("/authenticate")
    public APIResponseDTO<AccessTokenPayload> authenticate(
            @RequestUser AccessTokenPayload payload) { ... }

    @AccessToken
    @PutMapping("/logout")
    public APIResponseDTO<Void> logout(
            @RequestUser AccessTokenPayload userPayload) { ... }
    ```
    If a copied controller still pulls the token from headers for those methods, rewrite
    them to `@RequestUser AccessTokenPayload` instead.

11. **Build & install.** `mvn -f <targetDir>/user.authentication -q install` → produces
    `user.authentication-1.0.0.jar` for the consumer web project to depend on.

## Notes

- **Why `ADMINISTRATOR` survives the role trim.** `AuthController.viewRefreshTokens`
  guards with `@AccessToken(role = {UserRole.ADMINISTRATOR})`; the compiler enforces it.
  Add more roles to `UserRole` as the consuming project needs them — the `@AccessToken(role
  = …)` machinery already supports any subset.
- **DB column impact.** Trimming drops the `mfa` and `status` columns and the whole
  `user_profile_contact` table from the entity model. `ddl-auto` is `none` for the auth
  EMF, so existing columns/tables are simply ignored at runtime — no migration is forced,
  but the schema should eventually be aligned.
- **Spring Boot version.** Spring Boot 3.4.x parent, Java 17 by default. If the consuming
  web app is on a different Boot major (e.g. 4.0), align this module’s parent + Java to
  match before publishing, to avoid Spring Security API skew.
- **Auth is auto-configured.** Beans register via
  `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`
  (single line: the renamed `AutoConfiguration` class). Consumers just add the dependency
  — no `@Import` / `@ComponentScan` needed. Argument resolution works out of the box once
  the dependency is on the classpath.
- **Payload injection is first-class.** Any controller (in this library or a consumer app)
  that needs the caller identity uses `@RequestUser AccessTokenPayload`, not manual JWT
  parsing. That is intentional and must not be dropped when regenerating the module.

## Verify

- `mvn -f <targetDir>/user.authentication -q install` produces `user.authentication-1.0.0.jar`.
- The deleted enum files and `UserProfileContactEntity` / `UserProfileContactId` are absent;
  `grep -r "UserProfileContact" <targetDir>` returns nothing.
- `UserRole` declares only `ADMINISTRATOR` + `USER` (and still compiles, since the only
  hard reference is `ADMINISTRATOR`).
- `RequestUserArgumentResolver` and `AccessTokenHandlerInterceptor` exist; `WebConfig`
  registers both; `AutoConfiguration` defines the three beans.
- `AuthController` authenticate/logout use `@RequestUser AccessTokenPayload` (no header
  re-parsing).
- A consumer web project that depends on `user.authentication:1.0.0` boots and
  `POST /auth/login` against a seeded `<basePackage>.user_info` row returns
  `{accessToken, refreshToken}`.
- `GET /auth/authenticate` with `Authorization: Bearer <accessToken>` returns the same
  payload shape as `@RequestUser` would inject.

## Dependencies

Spring Boot 3.4.x parent, `spring-boot-starter` + `-web` + `-data-jpa` (all `optional`),
MySQL Connector/J, JJWT 0.12.x (`jjwt-api` + `jjwt-impl` + `jjwt-jackson`), AWS SDK
DynamoDB + DynamoDB Enhanced (via the AWS BOM), springdoc, spring-security-crypto,
Lombok, and `<basePackage>:domainutil`. Jakarta namespace throughout.
