---
name: spring--graalvm-native
description: >-
  Compile a Spring Boot web app (Java or Kotlin, Gradle or Maven) into a GraalVM
  native executable: pin GraalVM 25 for Spring Boot 4, apply plugins in the right
  order, keep a top-level Kotlin main, run processAot + nativeCompile, register
  closed-world metadata in reachability-metadata.json (not the old
  reflect-config.json), keep unused JDBC drivers off the native classpath, and
  diagnose AotInitializerNotFoundException, image-heap ProcessRunner, Flyway
  MissingReflectionRegistrationError, and Hibernate 7.2 native crashes
  (JpaLogger_$logger, DynamicInsertAnnotation, EventListener[], Parameter.getName,
  HibernateProxy/BytecodeProvider=none, kotlin.collections.EmptyList,
  RecordComponent.getAccessor, Java record getRecordComponents).
  Use when the user wants a GraalVM native image, nativeCompile, native-image,
  AOT-processed Spring Boot executable, bundled desktop/Tauri backend binary, or
  help with native-image reflection / reachability metadata / Flyway / Hibernate
  native crashes.
  Trigger phrases: "GraalVM native image", "nativeCompile", "compile Spring Boot
  to an executable", "AotInitializerNotFoundException",
  "MissingReflectionRegistrationError", "reachability-metadata.json",
  "reflect-config.json", "GraalVM 25", "bundle backend-native", "Flyway native
  image", "initialize-at-build-time ProcessRunner", "JpaLogger",
  "Invalid logger interface", "entityManagerFactory", "Hibernate 7.2 native",
  "HibernateProxy", "BytecodeProvider is 'none'", "EmptyList",
  "getAccessor", "Record components not available", "FlowResponseDTO",
  "/v3/api-docs", "/docs/commands".
---

# Spring Boot → GraalVM native executable

Turn a Spring Boot web app into a single native binary (`native-image`). This is
**not** `jpackage` / a fat JAR. The binary has no JVM: Graal does closed-world
analysis at build time. Anything used via reflection, SPI, JDBC `Class.forName`,
Jackson getters, Hibernate dialects, or Flyway plugins is **invisible** unless
AOT processing or explicit metadata keeps it.

This skill is the playbook proven on a Spring Boot **4.0.7** + Kotlin + Gradle +
H2 + Flyway native image (desktop-bundled `backend-native`). Follow it in order.
Do **not** skip the version pin: Boot 4 + GraalVM 17 produces a binary that
**builds** and then **dies on first boot**.

## Mandatory trigger

Load this skill **before** changing Gradle/Maven native config, writing
`META-INF/native-image/**`, or running `nativeCompile` / `native-image` when the
user asks to:

- compile / bundle a Spring Boot web app as a GraalVM native executable
- fix `AotInitializerNotFoundException`, `MissingReflectionRegistrationError`,
  “object found in the image heap”, `Invalid logger interface …JpaLogger`,
  `DynamicInsertAnnotation.<init>`, `PreFlushEventListener[]`,
  `Parameter.getName()`, `HibernateProxy` / `BytecodeProvider is 'none'`,
  `kotlin.collections.EmptyList`, `RecordComponent.getAccessor`, or
  `Record components not available for record class`
- explain or edit `reachability-metadata.json` vs `reflect-config.json`
- wire `org.graalvm.buildtools.native` into an existing Boot 4 app

**Prefer other skills when:** Lambda/SnapStart (`lambda--java-springboot`);
plain JVM fat JAR; Flyway SQL migrations with no native image
(`db--flyway-migration`).

## Version pins (do not mix)

| Piece | Pin | Why |
|---|---|---|
| Spring Boot | **4.0.x** (this playbook: 4.0.7) | AOT writes `reachability-metadata.json` |
| GraalVM JDK + `native-image` | **25** (`graalvm-jdk@25`) | Boot 4 AOT metadata is ignored by Graal 17 |
| GraalVM native Gradle plugin | **0.11.x** (`org.graalvm.buildtools.native`) | wires `processAot` onto the native classpath |
| Kotlin (if used) | **2.2.x** + `kotlin("plugin.spring")` | plugin **order** matters (see below) |
| Java language level | 17 bytecode is fine; **build JDK must still be GraalVM 25** | toolchain ≠ native-image JDK |

macOS install:

```bash
brew install --cask graalvm-jdk@25
export JAVA_HOME=/Library/Java/JavaVirtualMachines/graalvm-25.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
java -version          # must say GraalVM … 25
native-image --version # must exist; bundled in the JDK, no `gu install`
```

**Refuse GraalVM 17/21/23 for Boot 4.** `strings backend-native | grep Java.Version`
must show `25`, not `17.0.12`.

## Architecture (what actually runs)

```
./gradlew nativeCompile
        │
        ├─ processAot
        │     writes build/generated/aotSources
        │           …/ApplicationKt__ApplicationContextInitializer.java
        │     writes build/generated/aotResources
        │           META-INF/native-image/**/reachability-metadata.json
        │
        └─ native-image  (GraalVM 25)
              classpath = app + aot classes + aot resources
              output    = build/native/nativeCompile/<imageName>
```

At runtime Spring Boot starts in **AOT mode** and loads
`{MainClass}__ApplicationContextInitializer` **by name**. If that class was
tree-shaken (wrong Graal, Kotlin wiping the `aot` source set, companion-object
`main`), you get `AotInitializerNotFoundException` and `/health` is connection
refused.

## Kotlin main class (do not improvise)

Use start.spring.io style — **top-level `fun main`**, never `@JvmStatic` on a
companion:

```kotlin
@SpringBootApplication
class Application

fun main(args: Array<String>) {
    runApplication<Application>(*args)
}
```

| Style | Runtime looks for |
|---|---|
| Top-level `fun main` in `Application.kt` | `ApplicationKt__ApplicationContextInitializer` |
| `companion object { @JvmStatic fun main }` | `Application$Companion__…` (wrong; AOT generated `Application__…`) |

Pin the same FQCN everywhere:

```kotlin
springBoot { mainClass.set("com.example.ApplicationKt") }
graalvmNative {
    binaries.named("main") {
        mainClass.set("com.example.ApplicationKt")
    }
}
```

## Plugin order (Gradle + Kotlin)

Apply **Kotlin first, Graal native last**. Kotlin ≥ 1.9 can reset `aot` source-set
resource dirs ([KT-60459](https://youtrack.jetbrains.com/issue/KT-60459),
[spring-boot#36488](https://github.com/spring-projects/spring-boot/issues/36488)).
If Kotlin is applied after Boot AOT, `ApplicationKt__ApplicationContextInitializer`
is generated but **not** on the `native-image` classpath.

```kotlin
plugins {
    kotlin("jvm")
    kotlin("plugin.spring")
    kotlin("plugin.jpa")            // if JPA
    id("org.springframework.boot")
    id("io.spring.dependency-management")
    id("org.graalvm.buildtools.native")  // LAST
}
```

Copy the `graalvmNative { }` block from `templates/graalvm-native.gradle.kts`.

Maven: `native-maven-plugin` + Spring Boot AOT; still GraalVM 25. Do not native-image
a shaded fat JAR (multi-release Features such as sqlite-jdbc’s get dropped).

## Closed-world metadata: which file

**New registrations go only in `reachability-metadata.json`.** Do not duplicate
them into `reflect-config.json`.

| File | Era | Shape |
|---|---|---|
| `reachability-metadata.json` | GraalVM **23+ / 25** (canonical) | object: `{ "reflection": [ { "type": "…" } ], "resources": […], "jni": […] }` |
| `reflect-config.json` | GraalVM ~21 and earlier | array: `[ { "name": "…" } ]` |

Spring Boot 4 AOT already emits `reachability-metadata.json`. GraalVM 25 error
messages tell you to add to that file. GraalVM 17 **ignores** it, which is why
the AOT initializer vanishes.

Put project hints at:

```
src/main/resources/META-INF/native-image/reachability-metadata.json
src/main/resources/META-INF/native-image/native-image.properties   # extra Args=
```

Libraries may ship their own under `META-INF/native-image/<group>/<artifact>/`.

`native-image.properties` `Args=` is for **build-time init / URL protocols /
charsets**, not for listing every reflected method.

## What belongs on the native classpath

Native-image will **reach** every type on the runtime classpath that AOT or a
Graal `Feature` marks reachable. Unused drivers still get analyzed.

**Rule:** if it is not needed in the native binary, it must not be on native/AOT
classpaths.

| Keep | Drop from native |
|---|---|
| The real JDBC driver (H2, Postgres, …) | Leftover `sqlite-jdbc` after an engine swap |
| Flyway (if you migrate at boot) | `devtools` |
| | Testcontainers, test JDBC drivers |

sqlite-jdbc 3.44 on a Graal 25 image fails the **build** with:

```
UnsupportedFeatureException: An object of type 'org.sqlite.util.ProcessRunner'
was found in the image heap … marked for initialization at image run time
```

Fix: remove the dependency, or `exclude` it from configurations whose name
contains `native` / `aot`, and `@ConditionalOnClass(name = ["org.sqlite.JDBC"])`
any migrator bean. One-shot data moves belong in a host script
(`scripts/migrate_*.py`), not in the native binary.

`--initialize-at-build-time=org.sqlite.util.ProcessRunner` is a last resort for
apps that **must** ship sqlite-jdbc. Prefer deletion.

## Flyway (Boot 4 + Graal 25)

Flyway 11 copies `ConfigurationExtension` beans with Jackson
(`ConfigurationExtension.copy()` → `ObjectMapper.writeValueAsString`). Every
public getter is a reflective invoke. AOT does **not** register these. First
crash:

```
MissingReflectionRegistrationError: Cannot reflectively invoke method
'public java.lang.String
 org.flywaydb.core.internal.configuration.extensions
    .PrepareScriptFilenameConfigurationExtension.getUndoFilename()'
```

Register **the whole set** of `ConfigurationExtension` implementations (and
nested `CleanModel` / `SchemaModel`), not one method. Copy
`templates/flyway-reachability-metadata.json` into the project file (merge
`reflection` arrays; do not replace H2/Hibernate entries).

Also keep `db/migration/**` as resources (Boot AOT usually already adds
`db/migration/**` globs).

## Hibernate 7.2 (Boot 4.0.2+ + Graal 25)

Native Build Tools **0.11.1** reachability metadata stops at
`hibernate-core` **7.1**. Boot 4.0.7 pulls Hibernate **7.2.x**. Spring Boot
**4.0.2+** dropped `Hibernate72RuntimeHints`. The binary **builds**, then
`entityManagerFactory` dies on first boot. JVM `bootRun` will not show this.

Do **not** register only `JpaLogger_$logger`. After metadata is complete, first
**request** traffic still fails: lazy `@ManyToOne` needs `HibernateProxy`, then
Jackson’s Kotlin module needs `EmptyList`, then springdoc needs
`RecordComponent.getAccessor()`, then library Java records need every accessor
registered. Full playbook: `references/hibernate-72-native.md`.

1. Resolve the **actual** `hibernate-core` jar (not the 7.1 metadata zip).
2. Run `templates/extract-hibernate-72-metadata.py <jar>` and **merge**
   `reflection` + `resources` into the project
   `reachability-metadata.json`.
3. Copy `templates/Hibernate72NativeHints.kt` and
   `templates/hibernate-72-jdk-reflect.json`.
4. Kotlin: `freeCompilerArgs.add("-java-parameters")`.
5. Set every `@ManyToOne` / `@OneToOne` to `FetchType.EAGER` (collections may
   stay `LAZY`). Do not re-enable ByteBuddy in native.
6. If the app ships springdoc or Java records, merge
   `RecordComponent` / `Class.isRecord` / `getRecordComponents` from the JDK
   template, then extract **all** `extends java.lang.Record` types from library
   jars (`javap`) and register each whole type (not only `RecordComponent`).
7. Rebuild **native** and curl `/health`, a JPA JSON list, `/v3/api-docs`, and
   any `/docs/commands`-style record payload. `/health` alone misses later gaps.

Register the generated `Foo_$logger` class, not only the `Foo` interface.
Annotation wrappers need **declared** constructors
(`(Annotation, ModelsContext)`). Listener arrays are `{ "type": "…Listener[]" }`
with no extra flags.

## Standard `native-image` Args

Minimum set that has been needed for Boot + Logback + HTTP:

```
--verbose
-H:+ReportExceptionStackTraces
--initialize-at-run-time=ch.qos.logback
--initialize-at-run-time=org.slf4j.LoggerFactory
--initialize-at-run-time=io.netty.handler.ssl
-H:+AddAllCharsets
-H:EnableURLProtocols=http,https
```

Logback `StatusBase` / `Logger` often also need `--initialize-at-run-time`
(see `templates/native-image.properties`). Add new `--initialize-at-run-time`
only for types the error names; do not blanket-init Spring.

## Build workflow (agent checklist)

1. **Confirm GraalVM 25** (`java -version` and `native-image --version`). Abort
   with the brew cask command if missing. Never fall back to `graalvm-jdk-17`.
2. **Confirm plugin order + top-level `main` + matching `mainClass`.**
3. **Strip unused native classpath entries** (sqlite-jdbc, extra drivers).
4. **Merge Flyway + Hibernate 7.2 + JDK reflect hints** into
   `reachability-metadata.json` (see Flyway and Hibernate 7.2 sections).
   If the app uses JPA + Kotlin, extract from the resolved `hibernate-core`
   jar — do not copy 7.1 metadata.
5. Fast JVM AOT smoke (optional, before the long native build):
   ```bash
   ./gradlew processAot
   ls build/classes/java/aot/**/ApplicationKt__ApplicationContextInitializer.class
   ls build/generated/aotResources/META-INF/native-image/**/reachability-metadata.json
   ```
6. `./gradlew nativeCompile` (or `./gradlew clean nativeCompile` after metadata
   changes). Output: `build/native/nativeCompile/<imageName>`.
7. Run the binary **outside** the JVM:
   ```bash
   ./build/native/nativeCompile/<imageName> --server.port=7070
   curl -sf http://127.0.0.1:7070/health
   curl -sf http://127.0.0.1:7070/folders        # JPA + emptyList(); /health is not enough
   curl -sf http://127.0.0.1:7070/v3/api-docs    # springdoc RecordComponent.getAccessor
   curl -sf http://127.0.0.1:7070/docs/commands  # Java record getRecordComponents
   ```
8. Confirm `strings <binary> | grep Java.Version` → `25`.
9. If it dies, **read the process stdout/stderr** (a wrapper must pipe them;
   discarded stdio makes native failures look like “connection refused”).

A production wrapper **must** fail if Graal 25 is missing — copy
`templates/find-graalvm25.sh`.

## Diagnosis table

| Symptom | Cause | Fix |
|---|---|---|
| `AotInitializerNotFoundException: ApplicationKt__ApplicationContextInitializer` and `strings` shows `Java.Version=17` | Boot 4 AOT metadata ignored by Graal 17 | Rebuild with GraalVM 25 |
| Same exception, `Java.Version=25`, class exists under `build/classes/java/aot` | Kotlin wiped `aot` source set / wrong plugin order | Kotlin plugins first, native plugin last |
| Same exception, companion `main` | AOT name ≠ runtime main class | Top-level `fun main` + `ApplicationKt` |
| `ProcessRunner` / `UnsupportedFeatureException` image heap | sqlite-jdbc (or similar) initialized at build vs run | Remove from native classpath |
| `MissingReflectionRegistrationError` naming a getter | Jackson / Flyway / Hibernate reflection | Add that **type** (all public methods) to `reachability-metadata.json`, rebuild |
| `Invalid logger interface org.hibernate.jpa.internal.JpaLogger (implementation not found)` | Hibernate **7.2** `*_$logger` missing; metadata repo still 7.1; Boot ≥4.0.2 dropped `Hibernate72RuntimeHints` | Extract **all** `*_$logger` from the 7.2 jar + i18n resources. See `references/hibernate-72-native.md` |
| `NoSuchMethodException: …DynamicInsertAnnotation.<init>(DynamicInsert, ModelsContext)` | Hibernate 7.2 annotation wrappers not registered | Register **all** `org.hibernate.boot.models.annotations.internal.*` (declared ctors) |
| `Cannot reflectively instantiate …PreFlushEventListener[]` | Hibernate `EventListenerGroupImpl` allocates listener arrays | Register every `org.hibernate.event.spi.*Listener[]` |
| `NoSuchMethodException: java.lang.reflect.Parameter.getName()` under `KotlinBeanInfoFactory` | kotlin-reflect in native image | JDK reflect types + `-java-parameters`. Copy `templates/hibernate-72-jdk-reflect.json` |
| `Generation of HibernateProxy instances at runtime is not allowed when the configured BytecodeProvider is 'none'` | Native image disables ByteBuddy. Lazy `@ManyToOne` / `@OneToOne` need a runtime subclass proxy. Lazy collections (`@OneToMany`) are fine (`PersistentSet`). | Set to-one `fetch = FetchType.EAGER` (JPA default), or build-time enhancement + `@ConcreteProxy`. Do not try to re-enable ByteBuddy in native. |
| `KotlinReflectionInternalError: Unresolved class: class kotlin.collections.EmptyList` under Jackson kotlin module | `emptyList()` serializes as `EmptyList`; kotlin-reflect cannot resolve it unless registered | Register `kotlin.collections.EmptyList` / `EmptySet` / `EmptyMap` / `EmptyIterator` in `reachability-metadata.json` |
| Swagger UI `Failed to load API definition` / `GET /v3/api-docs` `NoSuchMethodError: Can't find getAccessor method` | springdoc `MethodParameterPojoExtractor` and kotlin-reflect call `java.lang.reflect.RecordComponent.getAccessor()` plus `Class.isRecord` / `getRecordComponents` | Register `java.lang.reflect.RecordComponent` (all public/declared methods) and `Class.isRecord` / `Class.getRecordComponents`. Also `java.beans.Introspector` / `BeanInfo` / `PropertyDescriptor`. Rebuild native. `/health` and `/folders` can already be 200. |
| `UnsupportedFeatureError: Record components not available for record class … All record component accessor methods of this record class must be included in the reflection configuration` | GraalVM 25 will not call `Class.getRecordComponents()` unless **every** accessor of that record is registered. Nested record DTOs (domain-util `FlowResponseDTO`) fail one type at a time. | Register the **whole record type** (`allDeclaredConstructors`, `allPublicMethods`, `allDeclaredFields`, `allRecordComponents` if the metadata format accepts it) **and** every nested record it returns. Extract records from the jar with `javap` (`extends java.lang.Record`). |
| Native binary starts then `/health` connection refused | Process **exited**. Logs are on stdout | Capture stdout/stderr; do not debug port binding first |
| `SqliteJdbcFeature class not found` | Fat/shaded JAR dropped multi-release classes | Native-image exploded classpath, not a fat JAR |
| Logback “Could NOT find resource [logback.xml]” then Boot banner | Usually harmless (basic configurator). Real failure is the next exception | Keep reading |

After a `MissingReflectionRegistrationError`, **do not** register only the one
method in the message if the stack is `BeanSerializer` / `writeValueAsString` —
register the whole JavaBean (all public constructors + methods + declared
fields). The next getter will fail otherwise.

## Bundling (desktop / Tauri / sidecar)

The native binary is the artifact. A wrapper may spawn it with
`--server.port=` and `--spring.datasource.url=`. Pass **absolute** DB paths;
H2 `jdbc:h2:file:` appends `.mv.db` — strip a trailing `.db` if the wrapper
still thinks in SQLite filenames.

Pipe stdout **and** stderr into the UI/logs. Health-check `http://127.0.0.1:<port>/health`
until success or process exit. Random production ports are fine; the wrapper
must surface the chosen port.

## What not to do

- Do not “fix” AOT-not-found by adding the initializer to `reflect-config.json`
  while still building with Graal 17.
- Do not keep dual Flyway entries in both JSON formats.
- Do not `nativeCompile` a fat JAR.
- Do not put `main` on a Kotlin companion “to make the name prettier”.
- Do not leave one-time migration drivers on the native classpath “just in case”.
- Do not treat connection-refused on `/health` as a port bug when `process: exited`.
- Do not “fix” Hibernate 7.2 native boot by registering only `JpaLogger_$logger`
  or by pinning Spring Boot 4.0.1. Extract loggers, annotation wrappers, and
  listener arrays from the **resolved 7.2 jar**.
- Do not assume Graal reachability metadata 0.11.x covers Hibernate 7.2
  (`default-for` is 7.1). Check native-image logs for
  `org.hibernate.orm/hibernate-core/7.1.0.Final`.
- Do not treat a green `bootRun` as proof the native sidecar will start.
- Do not treat a green native `/health` as proof JPA works. Hit an endpoint that
  loads a lazy to-one and serializes `emptyList()`.
- Do not treat green `/folders` as proof swagger or `/docs/commands` works.
- Do not re-enable ByteBuddy / a runtime `BytecodeProvider` in native. Change
  `@ManyToOne`/`@OneToOne` to `EAGER` instead.
- Do not register only `java.lang.reflect.RecordComponent` and stop. GraalVM 25
  still requires **every accessor** of each concrete record type
  (`FlowResponseDTO` and nested records). Extract with `javap`
  (`extends java.lang.Record`).
