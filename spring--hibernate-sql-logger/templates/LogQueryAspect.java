package {{basePackage}}.common.aop.logging;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Drives {@link LogQueryStatementInspector} by activating a thread-local
 * context before the annotated method executes and printing the summary
 * after it completes.
 * <p>
 * Supports {@code @LogQuery} on both methods ({@code @annotation}) and
 * classes ({@code @within}).
 */
@Aspect
@Component
public class LogQueryAspect {

    @Around("@annotation({{basePackage}}.common.aop.logging.LogQuery)")
    public Object logQueries(ProceedingJoinPoint joinPoint) throws Throwable {
        return enableSqlLogging(joinPoint);
    }

    @Around("@within({{basePackage}}.common.aop.logging.LogQuery)")
    public Object logQueriesOnClass(ProceedingJoinPoint joinPoint) throws Throwable {
        return enableSqlLogging(joinPoint);
    }

    private Object enableSqlLogging(ProceedingJoinPoint joinPoint) throws Throwable {
        org.slf4j.Logger log = LoggerFactory.getLogger(joinPoint.getTarget().getClass());
        log.info("SQL logging enabled for {}", joinPoint.getSignature().toShortString());

        Logger hibernateLogger = (Logger) LoggerFactory.getLogger("org.hibernate.SQL");
        Level prev = hibernateLogger.getLevel();
        hibernateLogger.setLevel(Level.DEBUG);

        LogQueryContext.enter(log);
        try {
            return joinPoint.proceed();
        } finally {
            LogQueryContext.exit();
            hibernateLogger.setLevel(prev);
        }
    }
}
