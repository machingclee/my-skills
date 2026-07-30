# my-springboot-api

Java **25** + Spring Boot **4** API that runs locally with Maven and deploys to
AWS Lambda (SnapStart) via the Serverless Framework v4.

## Prerequisites

- JDK 25 (for local `mvn` builds / `spring-boot:run`)
- Docker Desktop (for deploy packaging)
- Node.js 18+ (for Serverless CLI)
- AWS credentials configured
- Serverless Framework v4 login (`npx serverless login`) on first use

## Setup

```bash
npm install
```

## Local

```bash
mvn spring-boot:run
curl http://localhost:8080/ping
```

## Deploy

```bash
npm run deploy        # dev (serverless.yml)
npm run deploy:prod   # prod (serverless-prod.yml)
```

The package hook builds `target/function.jar` inside
`maven:3.9.11-eclipse-temurin-25`.

## Project layout

| Path | Role |
|------|------|
| `src/.../Application.java` | Spring Boot main (local + Lambda) |
| `src/.../LambdaHandler.java` | Lambda `RequestHandler` adapter |
| `src/.../controller/` | REST controllers |
| `pom.xml` | Deps + thin Lambda assembly |
| `src/assembly/lambda.xml` | Classes + `lib/` packaging (no Tomcat) |
| `serverless.yml` | Dev stage + SnapStart + Docker build hook |

## Notes

- Deploy artifact is the Maven assembly `target/function.jar` (classes + `lib/`), **not** a Boot fat jar.
- Tomcat is excluded from the Lambda package; local `mvn spring-boot:run` still uses it.
- See the skill `lambda--java-springboot` for full gotchas (SnapStart, v4 license, etc.).
