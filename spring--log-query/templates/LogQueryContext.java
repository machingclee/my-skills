package {{basePackage}}.common.aop.logging;

import org.slf4j.Logger;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Thread-local context for {@link LogQueryStatementInspector}.
 * Collects SQL fingerprints during a {@code @LogQuery}-annotated method,
 * then prints a deduplicated summary on exit.
 */
final class LogQueryContext {

    private static final ThreadLocal<Logger> LOGGER = new ThreadLocal<>();
    private static final ThreadLocal<Integer> DEPTH = ThreadLocal.withInitial(() -> 0);
    private static final ThreadLocal<List<Entry>> ENTRIES = ThreadLocal.withInitial(ArrayList::new);

    private LogQueryContext() {}

    static void enter(Logger log) {
        int d = DEPTH.get();
        DEPTH.set(d + 1);
        if (d == 0) {
            LOGGER.set(log);
            ENTRIES.get().clear();
        }
    }

    static void exit() {
        int d = DEPTH.get();
        if (d <= 1) {
            Logger log = LOGGER.get();
            if (log != null) {
                printSummary(log);
            }
            LOGGER.remove();
            ENTRIES.remove();
            DEPTH.remove();
        } else {
            DEPTH.set(d - 1);
        }
    }

    static boolean isActive() {
        return LOGGER.get() != null;
    }

    static void count(String fingerprint, String callSite) {
        ENTRIES.get().add(new Entry(fingerprint, callSite));
    }

    // -- Summary output ---------------------------------------------------------

    private static void printSummary(Logger log) {
        List<Entry> entries = ENTRIES.get();
        if (entries.isEmpty()) return;

        Map<String, List<Entry>> groups = entries.stream()
                .collect(Collectors.groupingBy(e -> e.fingerprint + "|||" + e.callSite,
                        LinkedHashMap::new, Collectors.toList()));

        int total = entries.size();
        long uniquePatterns = groups.size();
        List<Map.Entry<String, List<Entry>>> nPlus1 = groups.entrySet().stream()
                .filter(e -> e.getValue().size() >= 3)
                .sorted((a, b) -> Integer.compare(b.getValue().size(), a.getValue().size()))
                .toList();

        log.info("-- SQL summary: {} queries, {} unique patterns --", total, uniquePatterns);

        if (nPlus1.isEmpty()) {
            log.info("  No N+1 detected");
            return;
        }

        log.info("  N+1 candidates (>=3 repeats):");
        for (var group : nPlus1) {
            int count = group.getValue().size();
            Entry sample = group.getValue().get(0);
            String[] parts = group.getKey().split("\\|\\|\\|", 2);
            String callSite = parts.length > 1 ? parts[1] : "?";
            String entity = primaryEntity(sample.fingerprint);
            String joins = joinsSummary(sample.fingerprint);
            log.info("    {}x  {}  <- {}  {}", count, entity, callSite,
                    joins.isEmpty() ? "" : "\n        joins: " + joins);
        }
    }

    /** Guess entity class name from the FROM table (snake_case -> PascalCase). */
    private static String primaryEntity(String fingerprint) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile(
                "\\bfrom\\s+(\\w+(?:\\.\\w+)?)", java.util.regex.Pattern.CASE_INSENSITIVE)
                .matcher(fingerprint);
        if (!m.find()) return "?";
        String table = m.group(1);
        if (table.contains(".")) table = table.substring(table.lastIndexOf('.') + 1);
        return snakeToPascal(table);
    }

    /** Join chain for the summary (excludes the primary table). */
    private static String joinsSummary(String fingerprint) {
        List<String> tables = new ArrayList<>();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile(
                "(?:from|join)\\s+(\\w+(?:\\.\\w+)?)", java.util.regex.Pattern.CASE_INSENSITIVE)
                .matcher(fingerprint);
        boolean first = true;
        while (m.find()) {
            if (first) { first = false; continue; }
            String t = m.group(1);
            if (t.contains(".")) t = t.substring(t.lastIndexOf('.') + 1);
            if (!tables.contains(t)) tables.add(t);
        }
        return tables.stream().collect(Collectors.joining(" -> "));
    }

    /** Convert "booking_assigned_customer" -> "BookingAssignedCustomer". */
    private static String snakeToPascal(String snake) {
        StringBuilder sb = new StringBuilder();
        boolean upper = true;
        for (char c : snake.toCharArray()) {
            if (c == '_') { upper = true; continue; }
            sb.append(upper ? Character.toUpperCase(c) : c);
            upper = false;
        }
        return sb.toString();
    }

    private record Entry(String fingerprint, String callSite) {}
}
