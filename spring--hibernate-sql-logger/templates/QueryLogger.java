package {{basePackage}}.common.jpa;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import org.slf4j.LoggerFactory;

import java.util.function.Supplier;

public class QueryLogger {

    private QueryLogger() {}

    /**
     * Temporarily elevates the Hibernate SQL logger to DEBUG so all SQL
     * statements executed inside {@code block} are printed. The original
     * level is restored when the block completes (or throws).
     */
    public static <T> T withSqlLogging(Supplier<T> block) {
        Logger log = (Logger) LoggerFactory.getLogger("org.hibernate.SQL");
        Level prev = log.getLevel();
        log.setLevel(Level.DEBUG);
        try {
            return block.get();
        } finally {
            log.setLevel(prev);
        }
    }
}
