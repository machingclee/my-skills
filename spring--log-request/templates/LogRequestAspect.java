package {{basePackage}}.common.aop.logging;

import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.annotation.Annotation;
import java.util.Collections;
import java.util.stream.Collectors;

@Aspect
@Component
public class LogRequestAspect {

    @Around("@within({{basePackage}}.common.aop.logging.LogRequest)")
    public Object logRequest(ProceedingJoinPoint joinPoint) throws Throwable {
        Logger log = LoggerFactory.getLogger(joinPoint.getTarget().getClass());
        HttpServletRequest request = ((ServletRequestAttributes) RequestContextHolder.currentRequestAttributes()).getRequest();
        String httpMethod = request.getMethod();
        String uri = request.getRequestURI();
        String query = request.getQueryString();

        String headers = Collections.list(request.getHeaderNames()).stream()
                .map(h -> h + "=" + request.getHeader(h))
                .collect(Collectors.joining(", "));

        Object body = getRequestBodyArg(joinPoint);

        String method = ((MethodSignature) joinPoint.getSignature()).getMethod().getName();
        String endpoint = query != null ? uri + "?" + query : uri;
        log.info("{}() {} {} | headers=[{}] | body={}", method, httpMethod, endpoint, headers, body);
        long start = System.currentTimeMillis();
        try {
            Object result = joinPoint.proceed();
            long elapsed = System.currentTimeMillis() - start;
            log.info("{}() {} {} => {}ms", method, httpMethod, endpoint, elapsed);
            return result;
        } catch (Throwable t) {
            long elapsed = System.currentTimeMillis() - start;
            log.error("{}() {} {} => {}ms (error: {})", method, httpMethod, endpoint, elapsed, t.getMessage());
            throw t;
        }
    }

    private Object getRequestBodyArg(ProceedingJoinPoint joinPoint) {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Annotation[][] paramAnnotations = signature.getMethod().getParameterAnnotations();
        Object[] args = joinPoint.getArgs();
        for (int i = 0; i < paramAnnotations.length; i++) {
            for (Annotation annotation : paramAnnotations[i]) {
                if (annotation instanceof RequestBody) {
                    return args[i];
                }
            }
        }
        return null;
    }
}
