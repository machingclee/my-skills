# Reachability metadata vs reflect-config

Same closed-world idea, two file formats. **New work: `reachability-metadata.json` only.**

## Why native images need this at all

`native-image` only includes what static analysis can see. Reflection, SPI,
`Class.forName`, Jackson getters, Hibernate dialects, Flyway plugins are
invisible. Spring Boot 4 `processAot` covers a lot; leftover gaps are this file.

## Formats

### `reachability-metadata.json` (GraalVM 23+ / 25, canonical)

Path: `src/main/resources/META-INF/native-image/reachability-metadata.json`

```json
{
  "comment": "why these types are here",
  "reflection": [
    {
      "type": "com.example.Foo",
      "allPublicConstructors": true,
      "allDeclaredFields": true,
      "allPublicMethods": true
    }
  ],
  "resources": [
    { "glob": "db/migration/**" }
  ]
}
```

Key on each type: **`"type"`**.

Spring Boot 4 AOT already writes a generated copy under
`build/generated/aotResources/META-INF/native-image/<group>/<artifact>/`.
Project-level file **merges** with that; it does not replace it.

### `reflect-config.json` (legacy, GraalVM ~21)

Path: `src/main/resources/META-INF/native-image/reflect-config.json`

```json
[
  {
    "name": "com.example.Foo",
    "allPublicConstructors": true,
    "allPublicMethods": true
  }
]
```

Key on each type: **`"name"`**. Array root, reflection only.
Siblings were `resource-config.json`, `jni-config.json`, `proxy-config.json`.

GraalVM 25 still *may* read the old files, but error messages tell you to
edit `reachability-metadata.json`. Dual-listing the same class is noise.

## When Jackson is in the stack

If the crash is `MissingReflectionRegistrationError` under
`BeanSerializer` / `ObjectMapper.writeValueAsString`, register the **whole
JavaBean** (`allPublicMethods` + constructors + declared fields), not the
single getter in the message. The next getter will fail otherwise.

Flyway 11 `ConfigurationExtension.copy()` is this pattern.

## `native-image.properties`

Only extra `Args=` (initialize-at-run-time, URL protocols). Do not dump
hundreds of reflected methods here.
