---
name: spring--init-user-authentication
description: >-
  Scaffold a self-contained JWT auth library named {{basePackage}}:user.authentication with a
  trimmed UserRole (minimal role set), removal of unused enums and the UserProfileContact
  entity and its composite-key class, matching surgery on the User entity, a corrected JPA
  package-scan in AutoConfiguration, and a pom with the right coordinates. Delivers
  @AccessToken + @RequestUser argument resolution, JJWT access/refresh tokens, DynamoDB
  refresh-token storage, and the /auth controller. Use when creating the auth library for a
  new microservice or bootstrapping JWT login/register/logout/refresh.
---

# user.authentication Scaffold

`user.authentication` is a self-contained Spring Boot auto-configuring library that provides
JWT auth: `@AccessToken` interceptor + `@RequestUser` resolver, JJWT access/refresh
tokens, a DynamoDB refresh-token store, an isolated `authEntityManagerFactory`, and a
`/auth` controller (login / register / logout / refresh / authenticate).

This skill produces a properly-named **`{{basePackage}}:user.authentication`** module, with
a **minimal** `UserRole` and the requested enum / entity trimming.

## Inputs

| Input | Meaning | Example / default |
|---|---|---|
| `targetDir` | where to create the module | `/…/java-modules/user.authentication` |
| `basePackage` | project base package | `com.example` |
| `referenceRoot` | parent of `user.authentication` | `/Users/chingcheonglee/Repos/hkev/java-modules` |

`referenceRoot` defaults to `/Users/chingcheonglee/Repos/hkev/java-modules`. Confirm
`<referenceRoot>/user.authentication` exists first. The module name, groupId, artifactId
and package are fixed by this skill: `<basePackage>:user.authentication:1.0.0`, base
package `<basePackage>.user.authentication`.

## What it produces

A new Maven library at `<targetDir>/` whose source tree mirrors the reference module
exactly, **except** for the deletions and edits below.

```
<targetDir>/
  pom.xml                                   ← templates/pom.xml
  src/main/java/<basePackage>/user/authentication/
    Application.java                        (library marker — no main class)
    common/annotation/RequestUser.java
    common/authentication/{annotation/AccessToken, crypto/Sha512PasswordEncoder, jwt/JwtUtil, jwt/payload/*}
    common/configuration/{AutoConfiguration, AuthDbProperties, DynamoDbConfiguration, SwaggerConfiguration, WebConfig}
    common/domain/enums/UserRole.java       ← templates/UserRole.java (trimmed roles)
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

## How to use

1. **Confirm the reference.** Verify `<referenceRoot>/user.authentication` exists; ask
   for the correct `referenceRoot` if not.

2. **Copy the whole module.** Recursively copy `<referenceRoot>/user.authentication/` →
   `<targetDir>/user.authentication/`.

3. **Determine `<basePackage>` and rename the directory tree.** Ask the user for the
   project's base package (e.g., `com.example`, `com.acme`, `io.mycompany`). The base
   package is the root Java package shared by all modules — it's where repository, entity,
   and domain classes live. Then rename the package directory from the reference's concrete
   name to `<basePackage>`:
   ```bash
   old_pkg_path=$(echo "com.example" | tr '.' '/')
   new_pkg_path=$(echo "<basePackage>" | tr '.' '/')
   mv "<targetDir>/user.authentication/src/main/java/${old_pkg_path}" \
      "<targetDir>/user.authentication/src/main/java/${new_pkg_path}"
   ```
   This gives you `src/main/java/<basePackage>/user/authentication/…` on disk.

4. **Delete these files** (do not carry them over). Unused enums and the
   `UserProfileContact` relationship are unnecessary — a typical project only needs the
   `User` entity:
   - all unused enum files under `common/domain/enums/`
   - `common/jpa/entity/UserProfileContactEntity.java`
   - `common/domain/model/UserProfileContactId.java`

5. **Edit `common/jpa/entity/User.java`** — remove:
   - any unused enum imports,
   - the `import java.util.ArrayList;` and `import java.util.List;` lines (now unused),
   - the `status` field (its `@Convert` annotation, `@Column`, and field declaration),
   - the `mfa` field (its `@Convert` annotation, `@Column`, and field declaration),
   - the entire `//region Relationship` block: the `@OneToMany mappedBy = "user" ...`
     `contacts` field and its `UserProfileContactEntity` import.
   - **Keep:** `id`, `password`, `isTest`, `role`, `createDate`, `lastLoginDate`.
   The resulting entity maps `user_info` columns `{id, password, is_test, role,
   create_date, last_login_date}` only.

6. **Replace `common/domain/enums/UserRole.java`** with `templates/UserRole.java`
   (minimal roles: `ADMINISTRATOR`, `USER` — same `dbValue` / `fromDbValue` /
   `RoleConverter` shape). `ADMINISTRATOR` is mandatory because
   `AuthController.viewRefreshTokens` uses `@AccessToken(role =
   {UserRole.ADMINISTRATOR})`.

7. **Fix `common/configuration/AutoConfiguration.java`** — the
   `authEntityManagerFactory` bean's `setPackagesToScan(...)` points at packages that do
   not exist (`…infrastructure.mysql.entity`, `…domain.model`). Correct both to the real
   renamed paths:
   ```java
   em.setPackagesToScan(
       "<basePackage>.user.authentication.common.jpa.entity",
       "<basePackage>.user.authentication.common.domain.model"
   );
   ```

8. **Replace `pom.xml`** with `templates/pom.xml` (new coordinates
   `<basePackage>:user.authentication:1.0.0`). Deps are otherwise unchanged (optional
   starters, JJWT api/impl/jackson at compile scope so consumers inherit them, AWS
   DynamoDB + enhanced, springdoc, spring-security-crypto, MySQL, Lombok, domainutil,
   test starter), Java 17, Lombok processor path, AWS BOM in `<dependencyManagement>`.

9. **Replace all package references.** Now that all files are in place, globally replace
   every `com.example` AND every `{{basePackage}}` placeholder with `<basePackage>`
   across the entire module:
   ```bash
   find <targetDir>/user.authentication -type f \( -name '*.java' -o -name '*.xml' -o -name '*.yml' -o -name '*.imports' \) \
     -exec sed -i '' -e 's|com\.example|<basePackage>|g' -e 's|{{basePackage}}|<basePackage>|g' {} +
   ```
   This is a single sweep at the end so it catches the reference module's `com.example`
   (from the initial copy) AND any `{{basePackage}}` placeholders in template files
   (copied in steps 6–8). After this sweep:
   - Package declarations + imports → `<basePackage>.user.authentication.…`
   - `pom.xml` → `<groupId><basePackage></groupId>`, `<basePackage>:domainutil` dep
   - `AutoConfiguration.java` → `setPackagesToScan` points at
     `<basePackage>.user.authentication.common.jpa.entity` and
     `<basePackage>.user.authentication.common.domain.model`
   - `grep -r 'com\.example\|{{basePackage}}' <targetDir>` returns nothing.

10. **Build & install.** `mvn -f <targetDir>/user.authentication -q install` → produces
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
- **Spring Boot version.** Faithful to the reference: Spring Boot 3.4.x parent, Java 17.
  If the consuming web app is on Boot 4.0 (as `spring--init-web-project` produces), align
  this module's parent + Java to match before publishing, to avoid Spring Security 6↔7
  API skew.
- **Auth is auto-configured.** Beans register via
   `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`
   (single line: the renamed `AutoConfiguration` class). Consumers just add the dependency
   — no `@Import` / `@ComponentScan` needed.

## Verify

- `mvn -f <targetDir>/user.authentication -q install` produces `user.authentication-1.0.0.jar`.
- The deleted enum files and `UserProfileContactEntity` / `UserProfileContactId` are absent;
  `grep -r "UserProfileContact" <targetDir>` returns nothing.
- `UserRole` declares only `ADMINISTRATOR` + `USER` (and still compiles, since the only
  hard reference is `ADMINISTRATOR`).
- A consumer web project (e.g. one from `spring--init-web-project`) that depends on
  `user.authentication:1.0.0` boots and `POST /auth/login` against a seeded
  `<basePackage>.user_info` row returns `{accessToken, refreshToken}`.

## Dependencies

Spring Boot 3.4.x parent, `spring-boot-starter` + `-web` + `-data-jpa` (all `optional`),
MySQL Connector/J, JJWT 0.12.x (`jjwt-api` + `jjwt-impl` + `jjwt-jackson`), AWS SDK
DynamoDB + DynamoDB Enhanced (via the AWS BOM), springdoc, spring-security-crypto,
Lombok, and `<basePackage>:domainutil`. Jakarta namespace throughout.
