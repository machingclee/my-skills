---
name: lambda--java-springboot
description: >-
  Scaffold a Java Spring Boot 4 web API (Maven, Java 25) that runs locally via
  `mvn spring-boot:run` and deploys as one AWS Lambda behind REST API Gateway with
  SnapStart. Uses aws-serverless-java-container-springboot4,
  SpringBootLambdaContainerHandler, thin function.jar + lib/ (Tomcat excluded),
  and Serverless Framework v4 with a Docker Maven package hook.
  Use when the user wants a Lambda function running Java Spring Boot; to create,
  scaffold, bootstrap, clone, or replicate a Spring Boot-on-Lambda architecture;
  deploy Spring Boot to Lambda/API Gateway with Serverless; enable SnapStart for
  a Java Spring API; wire SpringBootLambdaContainerHandler; build a Lambda-
  compatible jar (not Boot fat jar); or add a REST controller to a project that
  follows this pattern.
  Trigger phrases: "I want a lambda function running java spring boot",
  "Spring Boot on Lambda", "Java Spring serverless API", "deploy Spring Boot to
  API Gateway", "SnapStart Spring Boot", "Serverless Framework Java Spring",
  "Maven Spring Boot Lambda", "bootRun and Lambda", "aws-serverless-java-container",
  "Java 25 Spring Boot 4 Lambda", "blog-comment-system", "lambda spring boot maven".
---

# Java Spring Boot 4 on AWS Lambda (Maven + Serverless Framework v4)

A Spring Boot web API that runs as a normal Boot app locally (`mvn spring-boot:run`)
and deploys as a single AWS Lambda function behind a REST API Gateway, with
**Lambda SnapStart** enabled for faster cold starts. Pure HTTP plumbing —
drop your own controllers/services in.

**Build tool: Maven only** (`pom.xml`). Do **not** generate Gradle files
(`build.gradle.kts`, `settings.gradle.kts`, `gradlew`, etc.).

## When to use this skill

- User wants a **Lambda function running Java Spring Boot**
- Create / scaffold / bootstrap a Spring Boot API on AWS Lambda + API Gateway
- Local `mvn spring-boot:run` **and** the same app on Lambda
- SnapStart, `SpringBootLambdaContainerHandler`, or `aws-serverless-java-container`
- Serverless Framework + Maven `lambda` assembly (thin jar + `lib/`, not Boot fat jar)
- Clone / replicate this architecture, or add a controller to an existing project that follows it

**Prefer other skills when:** Node/Express or Python FastAPI Lambda; Spring Boot only on ECS/EC2/App Runner (no Lambda); plain Java Lambda without Spring; SAM/CDK-only unless the user wants this Serverless + thin-jar pattern.

## Architecture

```
                local dev                              AWS
        ┌──────────────────────────┐         ┌────────────────────────────────────┐
   you ─▶ mvn spring-boot:run                │  API Gateway (REST)                │
        │ Application.main                   │   http: ANY /  +  ANY /{proxy+}    │
        │ embedded Tomcat :8080              │           │                        │
        └──────────────────────────┘         │           ▼                        │
                                             │  Lambda  …LambdaHandler            │
                                             │  SnapStart: true                   │
                                             │           │  aws-serverless-java-  │
                                             │           │  container-springboot4 │
                                             │           ▼                        │
                                             │        Application  (same Boot app)│
                                             └────────────────────────────────────┘
```

Two Java entry points — know which is which:

| File              | Role                                                              | Runs where  |
|-------------------|-------------------------------------------------------------------|-------------|
| `Application.java`| Spring Boot main class + routes via `@RestController`s.           | everywhere  |
| `LambdaHandler.java` | Lambda entry: `SpringBootLambdaContainerHandler` adapts Boot→Lambda. | Lambda only |

There is exactly **one** Lambda function. The API Gateway rules `http: ANY /`
and `http: ANY /{proxy+}` forward *every* request to it, and the container
adapter dispatches to the matching Spring MVC route. Add controllers under
`controller/`; nothing else changes to deploy.

## Stack versions (pin these)

| Piece | Version / value |
|-------|-----------------|
| Java | **25** (`runtime: java25`, `maven.compiler.release` 25) |
| Spring Boot | **4.0.7** (latest stable 4.0.x on Maven Central at skill authoring) |
| `aws-serverless-java-container-springboot4` | **3.0.2** |
| `aws-lambda-java-core` | **1.4.0** |
| Maven | **3.9.x** (Docker image `maven:3.9.11-eclipse-temurin-25`) |
| Serverless Framework | **4.40.0** (`frameworkVersion: '4'`) |
| `serverless-scriptable-plugin` | **1.3.1** (pre-package Docker build hook) |
| `serverless-prune-plugin` | **2.1.0** (keep last N Lambda versions; critical with SnapStart) |

## The build + package model (the key mental model)

```
src/  ──(mvn package)──▶  target/function.jar  ──(serverless deploy)──▶  Lambda
                                  │
                                  ├── *.class (your app)
                                  └── lib/*.jar (runtime deps, Tomcat excluded)
```

- **Local:** `mvn spring-boot:run` starts embedded Tomcat with `spring-boot-starter-web`.
- **Deploy:** Serverless runs `before:package:createDeploymentArtifacts`, which
  Docker-builds `function.jar` via `mvn -DskipTests package`, then uploads
  `package.artifact: target/function.jar`.
- The Lambda jar is **not** a Boot fat jar — it is a thin classes root +
  `lib/` deps folder (AWS Lambda Java packaging layout). Tomcat is excluded
  because the serverless-java-container provides the servlet bridge.
- Packaging is done by `maven-assembly-plugin` with
  `src/assembly/lambda.xml` (bound to the `package` phase). The Boot
  repackage goal is disabled so the deploy artifact is the thin jar.

## Scaffold a new project

Copy the files from this skill's `templates/` directory into a new project
folder (preserve `src/` layout), then replace the `# TODO` / `{{…}}`
placeholders and run setup.

```bash
mkdir my-api && cd my-api

# 1. Copy templates/ contents into the project root, preserving layout:
#    pom.xml  package.json  serverless.yml  serverless-prod.yml
#    .gitignore  README.md  src/assembly/lambda.xml
#    src/main/java/com/example/app/{Application,LambdaHandler}.java
#    src/main/java/com/example/app/controller/PingController.java
#    src/main/resources/application.yml
#    src/test/java/com/example/app/ApplicationTests.java
#
# 2. Rewrite package path: rename
#    src/main/java/com/example/app → src/main/java/<your/package/path>
#    and update package declarations + serverless handler string + pom coordinates.

# 3. Install JS tooling (Serverless Framework v4 + scriptable plugin)
npm install

# 4. Run locally (needs JDK 25 on PATH, or use a toolchains-aware Maven)
mvn spring-boot:run          # http://localhost:8080/ping

# 5. Deploy (Docker Desktop must be running — the package hook builds in Docker)
npm run deploy               # stage: dev
```

## Replace the placeholders

| File | What to change |
|------|----------------|
| `serverless.yml` / `serverless-prod.yml` | `service:`, `region:`, `handler:` FQCN, `MAIN_CLASS` |
| `pom.xml` | `groupId`, `artifactId`, `name` |
| `package.json` | `"name"` |
| `Application.java` / `LambdaHandler.java` / controllers | `package com.example.app` → your base package |
| `application.yml` | `spring.application.name` |

Suggested rename flow for package `com.acme.orders`:

```bash
mkdir -p src/main/java/com/acme/orders/controller
mkdir -p src/test/java/com/acme/orders
mv src/main/java/com/example/app/*.java src/main/java/com/acme/orders/
mv src/main/java/com/example/app/controller/*.java src/main/java/com/acme/orders/controller/
mv src/test/java/com/example/app/*.java src/test/java/com/acme/orders/
rm -rf src/main/java/com/example src/test/java/com/example
# then sed-replace package/import strings + serverless handler / MAIN_CLASS + pom groupId/artifactId
```

## Local dev & deploy

```bash
mvn test                     # unit/smoke tests
mvn spring-boot:run          # local Spring Boot (embedded Tomcat)
mvn -DskipTests package      # build target/function.jar locally (needs JDK 25)
npm run package              # Serverless package only (runs Docker build hook)
npm run deploy               # build in Docker + deploy (serverless.yml, stage dev)
npm run deploy:prod          # deploy serverless-prod.yml
npm run remove               # tear down the stack
```

`deploy` / `package` rely on Docker so the jar is always built against a
Linux JDK 25 image matching Lambda — even on Apple Silicon.

## Multi-stage deploy (one config file per stage)

Same pattern as the billie / Express skills: one Serverless file per stage.

1. Copy `serverless.yml` → `serverless-uat.yml` (or edit `serverless-prod.yml`).
2. Set `provider.stage`, and any stage-specific `environment` / VPC.
3. Deploy with an explicit config:
   ```bash
   npx serverless deploy --config serverless-prod.yml
   ```

## Adding a route

Add a `@RestController` under your package — no serverless change, no
handler change:

```java
@RestController
@RequestMapping("/api/items")
public class ItemController {
    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable String id) {
        return Map.of("success", true, "result", Map.of("id", id));
    }
}
```

## Template files

- `templates/serverless.yml` — provider (`java25`), single Lambda + REST
  catch-all, **SnapStart**, Docker `mvn package` hook, prune plugin.
- `templates/serverless-prod.yml` — prod-stage sibling config.
- `templates/pom.xml` — Spring Boot 4 parent, Java 25, Lambda deps,
  assembly plugin → `target/function.jar` (classes + `lib/`, Tomcat excluded),
  Boot repackage disabled.
- `templates/src/assembly/lambda.xml` — assembly descriptor for the thin jar.
- `templates/package.json` — `deploy` / `deploy:prod` / `package` / `remove`
  scripts; Serverless **4.40.0** + scriptable plugin.
- `templates/src/main/java/com/example/app/Application.java` — Boot main.
- `templates/src/main/java/com/example/app/LambdaHandler.java` —
  `RequestHandler` + `SpringBootLambdaContainerHandler`.
- `templates/src/main/java/com/example/app/controller/PingController.java` —
  `GET /ping`.
- `templates/src/main/resources/application.yml` — port, lazy init, app name.
- `templates/src/test/java/com/example/app/ApplicationTests.java` — context load.
- `templates/.gitignore`, `templates/README.md`.

## Gotchas (non-obvious — read before debugging)

1. **Exclude Tomcat from the Lambda package.** The container library bridges
   API Gateway → Spring MVC; shipping `tomcat-embed-*` wastes space and can
   confuse classpath scanning. The assembly descriptor excludes Tomcat /
   `spring-boot-*-tomcat*` artifacts. Local `spring-boot:run` still uses Tomcat
   via `spring-boot-starter-web` — exclusion is package-time only.

2. **Use a thin jar + `lib/`, not Boot's fat jar.** Lambda's Java runtime
   expects either a zip with classes at root + `lib/*.jar`, or a custom
   runtime. Spring Boot's repackaged jar (`BOOT-INF/` layout) will not load
   correctly as a plain Lambda handler jar. Always deploy `target/function.jar`
   from the assembly. The template **disables** `spring-boot-maven-plugin`
   repackage for this reason.

3. **SnapStart requires published versions + aliases.** `snapStart: true` in
   Serverless configures `SnapStart.ApplyOn: PublishedVersions`. Cold-start
   savings apply to traffic on the version/alias Serverless points API
   Gateway at — not at `$LATEST`.

4. **SnapStart + ephemeral state.** After a snapshot restore, don't assume
   open sockets, thread pools, or random seeds are still valid. Prefer
   lazy/reconnect clients. Avoid unique-per-instance in-memory caches that
   would be shared across restores incorrectly. DB connection pools usually
   recover, but validate under load.

5. **Static init of the container handler is intentional.**
   `SpringBootLambdaContainerHandler.getAwsProxyHandler(Application.class)`
   in a `static` field warms the Spring context during SnapStart's init
   phase so restores skip full Boot startup. Keep heavy one-time setup in
   static/`@PostConstruct` that is safe to snapshot.

6. **Docker must be running for `deploy`/`package`.** The scriptable hook
   runs `docker run … maven:3.9.11-eclipse-temurin-25 mvn -DskipTests package`.
   If Docker is down, packaging fails. On Apple Silicon this still produces a
   Lambda-compatible jar because dependencies are pure JVM bytecode.

7. **`MAIN_CLASS` env var.** Some adapters and ops tooling read
   `MAIN_CLASS` to know the Boot entry. Set it to the FQCN of
   `Application` (e.g. `com.example.app.Application`). Kotlin projects use a
   `…ApplicationKt` facade; plain Java has no `Kt` suffix.

8. **Serverless Framework v4 is not the same license as v3.** v4 requires
   CLI authentication (Serverless account) and has a proprietary npm
   package license for commercial use beyond the free tier. The skill pins
   `serverless@4.40.0` because it natively supports `runtime: java25`,
   built-in prune, and SnapStart. If you must stay on OSS-only tooling,
   use Serverless v3 or AWS SAM; the Maven assembly is independent of which
   deployer you pick.

9. **Prune Lambda versions.** SnapStart publishes versions; without
   `serverless-prune-plugin` (or equivalent), old versions accumulate and
   hit account limits. The template keeps the last 3.

10. **Keep Java versions aligned.** Compiler release 25, Docker image
    `…-temurin-25`, and `runtime: java25` must agree.

11. **API Gateway 6 MB response cap.** Same as other Lambda web adapters —
    don't stream large binaries through the API; redirect to S3 presigned
    URLs.

12. **REST API (`http:`) vs HTTP API (`httpApi:`).** This skill uses REST
    (`http:`) to match the billie project and Express skill. HTTP API is
    cheaper/simpler if you don't need REST-only features; change `events`
    accordingly and retest the adapter payload format (`AwsProxyRequest` is
    API Gateway REST / payload 1.0).

13. **VPC is optional.** The billie configs attach VPC for RDS access. The
    template leaves VPC commented out — uncomment and supply subnet /
    security group IDs when the app needs private network access. VPC +
    SnapStart works, but first invoke after deploy can still be slow while
    ENIs attach.

14. **Spring Boot 4 split test starters / package moves.** MockMvc support is
    no longer on the Boot 3 path. You need
    `spring-boot-starter-webmvc-test` and imports from
    `org.springframework.boot.webmvc.test.autoconfigure`
    (e.g. `@AutoConfigureMockMvc`), not
    `org.springframework.boot.test.autoconfigure.web.servlet`.

15. **Tomcat artifact names changed in Boot 4.** Exclude
    `spring-boot-starter-tomcat*`, `spring-boot-tomcat*`, and classic
    `tomcat-embed-*` from the assembly. Leaving them in bloats the package;
    the servlet API (`jakarta.servlet-api`) must stay.

16. **Do not add Gradle files.** This skill is Maven-only. If an older copy
    of the skill still had Gradle templates, delete them; never scaffold
    both build systems.

## Optional: VPC block (drop into `provider:`)

```yaml
provider:
  vpc:
    securityGroupIds:
      - ${env:SECURITY_GROUP_ID}
    subnetIds:
      - ${env:SUBNET_ID_1}
      - ${env:SUBNET_ID_2}
      - ${env:SUBNET_ID_3}
```

## Verify

- `mvn test` exits clean.
- `mvn spring-boot:run` then `curl localhost:8080/ping` → JSON with `"pong"`.
- `mvn -DskipTests package` produces `target/function.jar` containing
  classes at root and a `lib/` directory (no `BOOT-INF/`, no tomcat jars).
- `npm run deploy` publishes a SnapStart-enabled function; API Gateway URL
  serves `/ping`.
