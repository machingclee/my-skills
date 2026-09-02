graalvmNative {
    binaries {
        named("main") {
            imageName.set("backend-native") // change to the artifact name
            mainClass.set("com.example.ApplicationKt") // Java: com.example.Application

            buildArgs.add("--verbose")
            buildArgs.add("-H:+ReportExceptionStackTraces")

            buildArgs.add("--initialize-at-run-time=ch.qos.logback")
            buildArgs.add("--initialize-at-run-time=org.slf4j.LoggerFactory")
            buildArgs.add("--initialize-at-run-time=io.netty.handler.ssl")

            buildArgs.add("-H:+AddAllCharsets")
            buildArgs.add("-H:EnableURLProtocols=http,https")
        }
    }
}

// Kotlin + Spring Data JPA native: kotlin-reflect calls Parameter.getName().
kotlin {
    compilerOptions {
        freeCompilerArgs.add("-java-parameters")
    }
}

// Optional: drop leftover JDBC drivers from native/AOT classpaths only.
// Keep them on the JVM runtime classpath if a JVM migrator still needs them.
configurations.configureEach {
    val n = name.lowercase()
    if ("native" in n || "aot" in n) {
        exclude(group = "org.xerial", module = "sqlite-jdbc")
    }
}
