# Source this from a production bundle script, or copy the function.
# Spring Boot 4 AOT metadata is reachability-metadata.json (GraalVM 23+).
# GraalVM 17 ignores it and tree-shakes ApplicationKt__ApplicationContextInitializer.

find_graalvm25_home() {
    local candidate
    for candidate in \
        "/Library/Java/JavaVirtualMachines/graalvm-25.jdk/Contents/Home" \
        "/Library/Java/JavaVirtualMachines/graalvm-jdk-25/Contents/Home" \
        "/Library/Java/JavaVirtualMachines/graalvm-community-openjdk-25/Contents/Home"
    do
        if [ -x "$candidate/bin/native-image" ]; then
            echo "$candidate"
            return 0
        fi
    done

    for candidate in /Library/Java/JavaVirtualMachines/*/Contents/Home; do
        if [ -x "$candidate/bin/native-image" ] && \
            "$candidate/bin/java" -version 2>&1 | grep -Eq 'GraalVM.*25|25\..*GraalVM'; then
            echo "$candidate"
            return 0
        fi
    done

    if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/native-image" ] && \
        "$JAVA_HOME/bin/java" -version 2>&1 | grep -Eq 'GraalVM.*25|25\..*GraalVM'; then
        echo "$JAVA_HOME"
        return 0
    fi

    return 1
}

GRAALVM_HOME="$(find_graalvm25_home || true)"
if [ -z "$GRAALVM_HOME" ]; then
    echo "ERROR: GraalVM 25 with native-image is required for Spring Boot 4 native builds."
    echo "GraalVM 17 produces a binary that fails at startup with:"
    echo "  AotInitializerNotFoundException: ApplicationKt__ApplicationContextInitializer"
    echo ""
    echo "Install it with:"
    echo "  brew install --cask graalvm-jdk@25"
    exit 1
fi

export JAVA_HOME="$GRAALVM_HOME"
export PATH="$JAVA_HOME/bin:$PATH"
echo "Using GraalVM at: $JAVA_HOME"
"$JAVA_HOME/bin/java" -version
"$JAVA_HOME/bin/native-image" --version
