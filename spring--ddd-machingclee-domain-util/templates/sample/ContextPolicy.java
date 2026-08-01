package {{basePackage}}.context.{{context}}.policy;

import com.machingclee.domain.util.common.interfaces.Policy;
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

    @EventListener
    public void on{{Entity}}Created({{Entity}}CreatedEvent event) {
        log.info("{{Entity}} created id={} name={}", event.id(), event.name());
        // invoker.invoke(new SomeFollowOnCommand(...));
    }
}
