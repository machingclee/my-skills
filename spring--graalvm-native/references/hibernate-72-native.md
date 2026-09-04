# Hibernate 7.2 + GraalVM 25 (Spring Boot 4.0.2+)

Proven on Spring Boot **4.0.7** + Hibernate ORM **7.2.19.Final** + Native Build
Tools **0.11.1** + GraalVM **25**. The native binary **builds**, then dies on
first boot with `entityManagerFactory` unless these gaps are filled.

## Why 7.1 metadata is not enough

`org.graalvm.buildtools:graalvm-reachability-metadata:0.11.1` ships
`org.hibernate.orm/hibernate-core` through **7.1.0.Final** only
(`index.json` `default-for: 7\\.1\\..*`). Hibernate **7.2** is selected as 7.1.
Spring Boot **4.0.2+** also dropped `Hibernate72RuntimeHints` (still present in
4.0.1). Result: JBoss Logging cannot `Class.forName` the generated `*_$logger`
classes.

Confirm the plugin is still on 7.1:

```
-H:ConfigurationFileDirectories@user=.../org.hibernate.orm/hibernate-core/7.1.0.Final
```

Do **not** pin Boot 4.0.1 as the long-term fix. Register 7.2 types yourself.

## Crash sequence (fix the whole set, not one class)

Each rebuild surfaces the **next** missing reflective type. Register them all
before the long `nativeCompile`:

| Order | Symptom | Register |
|---|---|---|
| 1 | `IllegalArgumentException: Invalid logger interface org.hibernate.jpa.internal.JpaLogger (implementation not found)` | Every `*_$logger` in `hibernate-core` + `org/hibernate/**/*.i18n.properties` |
| 2 | `NoSuchMethodException: …DynamicInsertAnnotation.<init>(DynamicInsert, ModelsContext)` | Every class in `org.hibernate.boot.models.annotations.internal` |
| 3 | `MissingReflectionRegistrationError: Cannot reflectively instantiate …PreFlushEventListener[]` | Every `org.hibernate.event.spi.*Listener[]` |
| 4 | `NoSuchMethodException: java.lang.reflect.Parameter.getName()` (Kotlin + Spring Data) | JDK reflect types + `-java-parameters` |
| 5 | `Generation of HibernateProxy instances at runtime is not allowed when the configured BytecodeProvider is 'none'` | Native image disables ByteBuddy. Lazy `@ManyToOne` / `@OneToOne` need a runtime subclass. Set those to `FetchType.EAGER` (collections can stay `LAZY`). Do not re-enable ByteBuddy. |
| 6 | `KotlinReflectionInternalError: Unresolved class: class kotlin.collections.EmptyList` (Jackson kotlin module, HTTP 500 on list JSON) | `emptyList()` is the singleton `EmptyList`. Register `EmptyList` / `EmptySet` / `EmptyMap` / `EmptyIterator`. Copy `templates/hibernate-72-jdk-reflect.json`. |
| 7 | Swagger `GET /v3/api-docs` `NoSuchMethodError: Can't find getAccessor method` | springdoc `MethodParameterPojoExtractor` calls `RecordComponent.getAccessor()`. Register `java.lang.reflect.RecordComponent` plus `Class.isRecord` / `getRecordComponents`. |
| 8 | `UnsupportedFeatureError: Record components not available for record class com.machingclee.domain.util.common.dto.FlowResponseDTO` | Register **all** Java records returned by `/docs/commands` (and nested records), not only `RecordComponent`. Extract with `javap` (`extends java.lang.Record`) from the library jar. |

The JpaLogger error is **not** a Logback problem. Keep reading past
“Could NOT find resource [logback.xml]”.

## Extract from the **resolved** jar (do not hardcode 7.1 names)

```bash
# resolve, then:
JAR=$(find ~/.m2 ~/.gradle/caches -name 'hibernate-core-7.2*.jar' | head -1)
# loggers (Hibernate 7.2.19 = 53)
jar tf "$JAR" | rg '_\$logger\.class$' | sed 's|/|.|g; s|\.class$||'
# annotation wrappers (7.2.19 = 277, no inner classes)
jar tf "$JAR" | rg '^org/hibernate/boot/models/annotations/internal/[^$]+\.class$' \
  | sed 's|/|.|g; s|\.class$||'
# event listener interfaces → array types
jar tf "$JAR" | rg '^org/hibernate/event/spi/.*Listener\.class$' \
  | sed 's|/|.|g; s|\.class$||; s|$|[]|'
```

Merge into `src/main/resources/META-INF/native-image/reachability-metadata.json`:

```json
{ "type": "org.hibernate.jpa.internal.JpaLogger_$logger",
  "allDeclaredConstructors": true, "allPublicConstructors": true, "allPublicMethods": true }
{ "type": "org.hibernate.boot.models.annotations.internal.DynamicInsertAnnotation",
  "allDeclaredConstructors": true, "allPublicConstructors": true, "allPublicMethods": true }
{ "type": "org.hibernate.event.spi.PreFlushEventListener[]" }
```

Array entries need **only** `"type"` (Graal’s error message shape). Wrappers
need **declared** constructors: JBoss/Hibernate uses
`(Annotation, ModelsContext)`, not a no-arg ctor.

Also:

```json
"resources": [{ "glob": "org/hibernate/**/*.i18n.properties" }]
```

Run `templates/extract-hibernate-72-metadata.py` against the jar and merge the
`reflection` / `resources` arrays. Do not replace Flyway / H2 entries.

## RuntimeHints (belt and suspenders)

Copy `templates/Hibernate72NativeHints.kt`. `@ImportRuntimeHints` it next to
the app’s existing registrar. AOT then emits the same types into
`build/generated/aotResources/**/reachability-metadata.json`.

JBoss Logging looks up `Foo_$logger` for interface `Foo`. Register the
**generated class**, not only the interface.

## Kotlin / Spring Data: `Parameter.getName()`

After Hibernate comes up, Kotlin repositories fail with:

```
java.lang.NoSuchMethodException: java.lang.reflect.Parameter.getName()
  at kotlin.reflect.jvm.internal.impl.descriptors.runtime.structure.Java8ParameterNamesLoader
  at org.springframework.data.util.KotlinBeanInfoFactory.getBeanInfo
```

Register in `reachability-metadata.json`:

- `java.lang.reflect.Parameter` (all public + declared methods/ctors)
- `java.lang.reflect.Executable`, `Method`, `Constructor`, `Field`
- `kotlin.jvm.internal.DefaultConstructorMarker`

And keep parameter names in bytecode:

```kotlin
kotlin {
    compilerOptions {
        freeCompilerArgs.add("-java-parameters")
    }
}
```

Also merge the `EmptyList` / `EmptySet` / `EmptyMap` / `EmptyIterator` entries
from the same template. Jackson’s Kotlin module calls
`KClassImpl` on `emptyList()` when serializing a DTO list field.

## Springdoc `getAccessor` and Java records

`/health` and `/folders` can already be 200 while Swagger UI still fails.

### `RecordComponent.getAccessor`

```
NoSuchMethodError: Can't find `getAccessor` method
  at org.springdoc.core.extractor.MethodParameterPojoExtractor
```

springdoc walks types with `Class.isRecord()` / `Class.getRecordComponents()`
then `RecordComponent.getAccessor()`. Register those JDK APIs
(`templates/hibernate-72-jdk-reflect.json`). Also register
`java.beans.Introspector` / `BeanInfo` / `PropertyDescriptor`.

### Concrete record types (`getRecordComponents`)

```
UnsupportedFeatureError: Record components not available for record class
com.machingclee.domain.util.common.dto.FlowResponseDTO.
All record component accessor methods of this record class must be included
in the reflection configuration at image build time
```

Registering `RecordComponent` is **not** enough. GraalVM 25 refuses
`Class.getRecordComponents()` unless **every accessor** of that **concrete**
record is registered. Nested records fail one type at a time
(`FlowResponseDTO` then `CommandEventFlowDTO` then …).

Extract from the library jar (include inner classes with `$`):

```bash
javap -public -classpath domain-util-0.2.6.jar <fqcn>
# keep types whose javap output contains: extends java.lang.Record
```

Register each whole type:

```json
{
  "type": "com.machingclee.domain.util.common.dto.FlowResponseDTO",
  "allDeclaredConstructors": true,
  "allPublicConstructors": true,
  "allDeclaredMethods": true,
  "allPublicMethods": true,
  "allDeclaredFields": true,
  "allPublicFields": true,
  "allRecordComponents": true
}
```

`/docs/commands` is the smoke test for this gap, not `/v3/api-docs`.

## HibernateProxy (`BytecodeProvider=none`)

Native image **cannot** generate `HibernateProxy` subclasses. This is **not** a
missing reflect entry.

| Mapping | Native-safe? |
|---|---|
| `@OneToMany(LAZY)` / `@ManyToMany(LAZY)` | Yes (`PersistentSet` / bag) |
| `@ManyToOne(LAZY)` / `@OneToOne(LAZY)` | **No** — needs a runtime subclass |

Fix: `fetch = FetchType.EAGER` on every to-one (JPA default). Optional later:
build-time enhancement + `@ConcreteProxy`. Do **not** try to turn ByteBuddy
back on in the native binary.

## Smoke-test the **native** binary, not `bootRun`

```bash
./gradlew nativeCompile
./build/native/nativeCompile/<imageName> --server.port=7070
curl -sf http://127.0.0.1:7070/health
curl -sf http://127.0.0.1:7070/folders        # JPA + emptyList()
curl -sf http://127.0.0.1:7070/v3/api-docs    # springdoc getAccessor
curl -sf http://127.0.0.1:7070/docs/commands  # Java record accessors
```

A JVM run will not show these gaps. After a metadata **or entity fetch-type**
change, rebuild native; `processAot` alone is not enough.

Desktop / Tauri: copy the new binary into the sidecar path the wrapper actually
executes (`src-tauri/resources/...` **and** any installed `.app` bundle).
`/health` connection-refused with `process: exited` is this class of crash,
not a port bind.
