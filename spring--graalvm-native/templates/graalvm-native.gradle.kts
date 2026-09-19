graalvmNative {
    binaries {
        named("main") {
            imageName.set("backend-native") // change to the artifact name
            mainClass.set("com.example.ApplicationKt") // Java: com.example.Application

            // native-image defaults to all cores. Two OOMs, opposite knobs:
            //   exit 137 = kernel SIGKILL (too many threads / oversubscribed RAM)
            //   exit 3   = Java heap space, usually at [6/8] Compiling methods
            //              (builder -Xmx too small). 6g analyzes then dies compiling.
            // 2 threads + 10g: Peak RSS ~7GB on a 32GB Mac.
            buildArgs.add("-H:NumberOfThreads=2")
            buildArgs.add("-J-Xms4g")
            buildArgs.add("-J-Xmx10g")
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
