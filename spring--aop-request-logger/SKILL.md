---
name: spring--aop-request-logger
description: >-
  Scaffold an annotation-driven (@LogRequest) AOP request logger for Spring Boot
  REST controllers: an @Aspect that wraps every method of any controller class
  annotated with @LogRequest and logs the HTTP method, URI (with query string),
  request headers, the deserialized @RequestBody, elapsed milliseconds, and
  errors, using a per-controller SLF4J logger so the controller class name shows
  up as a clickable link in the IntelliJ console. Use when you want to log
  incoming HTTP requests at the controller layer, add request/response logging to
  all endpoints in a controller, measure controller method latency, or add a
  @LogRequest / @Aspect request-logging aspect to a Spring Boot project.
---

# AOP Request Logger Scaffold

This skill scaffolds an annotation-driven request logger: a `@LogRequest`
annotation placed on a controller class, plus an `@Aspect` that wraps every
method of that class and logs each request and its outcome.

The aspect creates its SLF4J logger from the target class
(`LoggerFactory.getLogger(targetClass)`), so the controller's fully-qualified
name appears as the logger prefix on each log line and is a clickable link to the
class in the IntelliJ console. The handler method name is printed in the message
for readability (see Notes for the click-to-method limitation).

## Mandatory Trigger

Invoke this skill before writing the aspect when the user asks to:

- "log HTTP requests at the controller" / "log incoming requests".
- "add request logging to a controller" / "@LogRequest" / "LogRequestAspect".
- "log request method, URI, headers, and body".
- "measure controller latency" / "time controller methods".
- "add an AOP request-logging aspect to this Spring Boot project".

## What It Produces

```
src/main/java/{{basePackage}}/common/aop/logging/
  LogRequest.java         # @Target(TYPE) marker annotation
  LogRequestAspect.java   # @Around("@within(...LogRequest)") aspect
```

## How To Use

1. Add the AOP starter dependency — Spring Boot Web does not pull it in, and
   without it `@Aspect` beans are not applied:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-aop</artifactId>
</dependency>
```

2. Copy both templates under `templates/` into the path above, replacing
   `{{basePackage}}` with the project's base package in every file. This includes
   the `@Around("@within(...)")` pointcut, which must reference the annotation by
   its fully-qualified name, and the `package` declaration in both files.
3. Annotate any controller class with `@LogRequest`:

```java
@RestController
@RequestMapping("/car-model")
@LogRequest
public class CarModelController { ... }
```

Every method in that controller is now wrapped — no per-method annotation needed.

## Notes

- **Clickable class name, not method.** Because the logger is created from the
  target class, the logger prefix resolves to the controller in IntelliJ and
  links to the class. The method name printed in the message (`methodName()`) is
  plain text and is not clickable: Spring AOP proxies do not expose the advised
  method's source line, so a true click-to-method link is not available without
  AspectJ compile/load-time weaving.
- **Body logging is safe.** The aspect logs the already-deserialized `@RequestBody`
  argument, not the raw input stream, so it needs no `ContentCachingRequestFilter`
  and does not consume the request.
- **Headers include `Authorization`.** All request headers are logged verbatim, so
  bearer tokens and cookies appear in the logs. Redact sensitive headers inside
  `logRequest` before joining if the logs ship to a shared sink.
- **Class-level, not method-level.** `@within` matches the annotated class, so the
  advice applies to every method on it. To exclude a method, move it to a
  controller without the annotation, or add a guard inside the advice.
- **`@AccessToken` / security annotations are unaffected.** This is an `@Around`
  advice on controller methods; it does not interfere with method-level security
  or `@RequestUser` resolution, which Spring resolves separately.

## Verify

- Hit any endpoint on an annotated controller and confirm two log lines: an entry
  line (`method() VERB /uri | headers=[...] | body=...`) and a completion line
  (`method() VERB /uri => Nms`).
- On an endpoint that throws, confirm the error line is logged before the
  exception propagates to the client.
- Confirm the logger prefix is the controller's package-qualified class name.

## Dependencies

Requires `spring-boot-starter-aop` (AspectJ proxy support) and
`spring-boot-starter-web` (controllers, `HttpServletRequest`, `@RequestBody`).
SLF4J/Logback come transitively with Spring Boot.
