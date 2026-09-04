---
name: spring--create-config
description: >-
  Externalize environment-specific values hardcoded inside Spring
  @Configuration classes into per-profile application yml files
  (application-local.yml / application-dev.yml / application-prod.yml) and bind
  them with a @ConfigurationProperties holder class (Lombok @Data). Use when
  the user asks to "move X into application-{local,dev,prod}.yml", "extract
  hardcoded CORS origins / URLs / credentials from code", "make this config
  profile-driven", "create a @ConfigurationProperties class", or when a config
  bean branches on stage.equals(...) to pick different values per environment.
---

# Spring Config — Profile-Driven @ConfigurationProperties

Move per-environment values (URLs, origins, credentials, ports) out of Java
config classes and into the profile YAML files, then bind them through a small
`@ConfigurationProperties` holder. The CORS-origin pattern this is based on:

`SecurityConfiguration` used to hardcode all origins in a
`if (stage.equals("local") || stage.equals("dev"))` branch; now each profile
yml owns its own `app.cors.allowed-origins` list.

## When To Use

Invoke before editing when the user asks to:

- "move these origins/URLs into application-local/dev/prod.yml".
- "extract hardcoded config from [ClassName]" / "remove hardcoded [values] from code".
- "make [property] per-profile" / "profile-driven config".
- "create a @ConfigurationProperties class for app.[x]".
- A `@Configuration` bean switches literal values on `stage` / profile
  (`if (stage.equals("local")) { ... } else if (stage.equals("prod")) { ... }`).

## The Rule

**Environment gating lives in the profile files, not in Java.** Each profile
file (`application-local.yml`, `application-dev.yml`, `application-prod.yml`)
already opens with its own `stage:` value — so a `stage.equals(...)` branch that
picks different *values* inside a config bean is a sign the values should be
externalized, and the branch itself deleted. Only *behavior* differences (e.g.
which endpoints require auth) legitimately stay as `stage` checks in code.

## Recipe

### 1. Read the profile files first

`src/main/resources/` holds:

- `application.yml` — common defaults (no `stage:`).
- `application-local.yml` / `application-dev.yml` / `application-prod.yml` —
  per-env overrides. Each starts with `stage: local | dev | prod` and carries
  module config under `app:` (e.g. `app.datasource`, `app.s3`, `app.cors`).

Add the new key under the existing `app:` section of every profile that needs
it. YAML block lists, URLs quoted (matches the existing quoted-URL style):

```yaml
app:
  cors:
    allowed-origins:
      - "http://localhost:3000"
      - "https://esales.hkev.com.hk"
```

Move values **verbatim** — preserve exactly what the user lists, including
redundant trailing-slash variants, unless the user opts to clean them up.

### 2. Create the @ConfigurationProperties holder

Put it next to the consumer — same package as the `@Configuration` class that
reads it. Existing examples: `S3Properties` (`app.s3`) beside `AwsConfiguration`,
`CorsProperties` (`app.cors`) beside `SecurityConfiguration`.

```java
package com.echarge.sales.common.configurations.web;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Binds {@code app.cors.*} from application YAML.
 */
@Data
@ConfigurationProperties("app.cors")
public class CorsProperties {

    /** Origins allowed to call the API cross-origin (per profile). */
    private List<String> allowedOrigins = List.of();
}
```

### 3. Wire it into the consuming @Configuration class

```java
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(CorsProperties.class)   // import ...EnableConfigurationProperties
public class SecurityConfiguration {

    private final CorsProperties corsProperties;

    public SecurityConfiguration(LoginSuccessHandler loginSuccessHandler,
                                 CorsProperties corsProperties) {
        this.loginSuccessHandler = loginSuccessHandler;
        this.corsProperties = corsProperties;
    }
```

Then replace the hardcoded literals and **delete the stage branch**:

```java
// before — hardcoded + stage-gated
if (stage.equals("local") || stage.equals("dev")) {
    config.setAllowedOrigins(List.of("http://localhost:3000", ...));
    ...
}

// after — bound from the active profile's yml
config.setAllowedOrigins(corsProperties.getAllowedOrigins());
```

### 4. Verify

```bash
mvn -q compile -o          # in the module dir; exit 0 = clean
```

Lombok prints `sun.misc.Unsafe` deprecation warnings — ignore them. In a
monorepo, sibling modules must be installed first if you edit their deps:
`mvn -pl <mod> -am install` (see install-deps-before-standalone-build).

## Binding Gotchas

- **`@Value` cannot bind a YAML block list** — it only handles single scalars /
  comma-separated strings. Lists need `@ConfigurationProperties`.
- **Relaxed binding** maps `allowed-origins` (yml) → `allowedOrigins` (field).
- **Lombok `@Data` is fine**: it generates the setter Spring's binder needs.
  Keep the field **non-final with a default** (`= List.of()`) so no
  required-args constructor is generated — Spring requires the no-arg
  constructor — and the app keeps its previous no-op behavior when the key is
  absent or a profile doesn't define it.
- A holder default replaces the old `@Value("${key:default}")` fallback idiom.
- Empty/missing list = "configure nothing", which reproduces the old
  empty-`CorsConfiguration` branch exactly, so behavior parity is easy to keep.

## Notes On Behavior Parity

Externalizing per profile can *change* behavior where the old stage gate was
broader or narrower than the new split. E.g. the CORS origins used to apply
only for `local`/`dev`; after the split the prod profile carries its own
origins and they now take effect in prod. Call this out to the user when the
old branch never applied to some environment the new yml now covers.
