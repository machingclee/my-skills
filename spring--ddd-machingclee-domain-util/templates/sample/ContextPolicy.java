package {{basePackage}}.context.{{context}}.policy;

import com.machingclee.domain.util.common.interfaces.Invariant;
import com.machingclee.domain.util.common.interfaces.Policy;
import {{basePackage}}.common.domainutils.{{context}}.{{Context}}CommandInvoker;
import {{basePackage}}.context.{{context}}.event.{{Entity}}CreatedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Reacts to domain events for the {{context}} slice.
 * Keep side effects explicit; use CommandInvoker for follow-on commands.
 */
@Component
public class {{Context}}Policy implements Policy {

    private static final Logger log = LoggerFactory.getLogger({{Context}}Policy.class);

    private final {{Context}}CommandInvoker invoker;

    public {{Context}}Policy({{Context}}CommandInvoker invoker) {
        this.invoker = invoker;
    }

    @EventListener
    @Invariant({
            "{{Entity}} row was persisted",
            "Optional follow-on commands share the same request id"
    })
    public void on{{Entity}}Created({{Entity}}CreatedEvent event) throws Exception {
        log.info("{{Entity}} created id={} name={}", event.id(), event.name());
        // optional follow-on:
        // invoker.invoke(new SomeFollowOnCommand(...));
    }
}
