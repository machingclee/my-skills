package {{basePackage}}.common.aop.logging;

import org.hibernate.resource.jdbc.spi.StatementInspector;

/**
 * Hibernate {@link StatementInspector} that, when {@link LogQueryContext} is active,
 * deduplicates SQL and records call sites so N+1 patterns are obvious.
 * <p>
 * Registered via {@code JpaConfiguration.setJpaPropertyMap} or the
 * {@code spring.jpa.properties.hibernate.session_factory.statement_inspector}
 * YAML property.
 */
public class LogQueryStatementInspector implements StatementInspector {

    // Skip frames from these packages when walking the stack to find call sites.
    // Add the project's own logging package so the inspector itself is skipped.
    private static final String[] SKIP_PREFIXES = {
        "org.hibernate",
        "org.springframework",
        "java.",
        "jakarta",
        "com.zaxxer",
        "com.mysql",
        "io.micrometer",
        "net.bytebuddy",
        "{{basePackage}}.common.aop.logging",
    };

    @Override
    public String inspect(String sql) {
        if (!LogQueryContext.isActive()) {
            return sql;
        }
        String fingerprint = fingerprint(sql);
        String callSite = findCallSite();
        LogQueryContext.count(fingerprint, callSite);
        return sql;
    }

    // -- SQL fingerprint: normalise literal values so identical queries match ----

    static String fingerprint(String sql) {
        String compact = sql.replace('\n', ' ').replaceAll("\\s+", " ");
        compact = compact.replaceAll("=\\d+", "=?");
        compact = compact.replaceAll("=\\d+\\.\\d+", "=?");
        compact = compact.replaceAll("'[^']*'", "?");
        compact = compact.replaceAll("in \\([?,]+\\)", "in (?)");
        return compact;
    }

    // -- Call-site extraction ---------------------------------------------------

    private String findCallSite() {
        StackTraceElement[] stack = Thread.currentThread().getStackTrace();

        StackTraceElement entityFrame = null;
        StackTraceElement callerFrame = null;

        for (StackTraceElement frame : stack) {
            String cn = frame.getClassName();
            if (shouldSkip(cn)) continue;

            if (entityFrame == null) {
                entityFrame = frame;
            } else if (callerFrame == null && !cn.startsWith("jdk.proxy")) {
                callerFrame = frame;
                break;
            }
        }

        if (entityFrame == null) return "(unknown)";

        String trigger = describeFrame(entityFrame);
        if (callerFrame != null) {
            trigger += " <- " + describeFrame(callerFrame);
        }
        return trigger;
    }

    private static String describeFrame(StackTraceElement f) {
        String cn = f.getClassName();
        String shortClass = cn.substring(cn.lastIndexOf('.') + 1);
        String method = f.getMethodName();
        // Extract field name from getter: "getCustomerDetail" -> "customerDetail"
        if (method.startsWith("get") && method.length() > 3) {
            String field = method.substring(3);
            field = Character.toLowerCase(field.charAt(0)) + field.substring(1);
            return shortClass + "." + field;
        }
        return shortClass + "." + method + ":" + f.getLineNumber();
    }

    // -- Skip logic -------------------------------------------------------------

    private static boolean shouldSkip(String className) {
        for (String prefix : SKIP_PREFIXES) {
            if (className.startsWith(prefix)) return true;
        }
        // Skip JDK internals but KEEP JDK proxies (Hibernate lazy-loading proxies
        // whose method name tells us which entity getter triggered the SQL).
        if (className.startsWith("jdk.") && !className.startsWith("jdk.proxy")) {
            return true;
        }
        return false;
    }
}
