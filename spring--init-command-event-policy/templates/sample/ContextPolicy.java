package {{basePackage}}.context.{{context}}.policy;

import com.echarge.domainutil.common.interfaces.Invariant;
import com.echarge.domainutil.common.interfaces.Policy;
import {{basePackage}}.common.domainutils.{{context}}.{{Context}}CommandInvoker;
import {{basePackage}}.context.{{context}}.event.{{Entity}}CreatedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Domain policy for the {{context}} bounded context.
 *
 * Policies listen to domain events and either enforce invariants (throw to abort the
 * surrounding transaction) or trigger follow-on commands. {@code @EventListener} makes
 * Spring invoke the method when the framework re-publishes the queued event; the
 * {@code @Invariant} annotation documents (and surfaces in the flow visualiser) the
 * business rule each method guards.
 *
 * Implementing the {@link Policy} marker is conventional — it lets the framework list
 * this class among the context's policies. Policies are dispatched AFTER the command's
 * transaction commits for post-commit events, or immediately for default events.
 */
@Component
@RequiredArgsConstructor
public class {{Context}}Policy implements Policy {

    private final {{Context}}CommandInvoker {{context}}CommandInvoker;

    @EventListener
    @Invariant("{{Entity}}.name must not be blank — abort the transaction if it is.")
    public void enforceNameNotBlank({{Entity}}CreatedEvent event) throws Exception {
        String name = event.get{{Entity}}DTO().getName();
        if (name == null || name.isBlank()) {
            throw new IllegalStateException("{{Entity}} name must not be blank");
        }

        // To trigger a follow-on command instead of (or in addition to) guarding:
        //   {{context}}CommandInvoker.invoke(SomeFollowUpCommand.builder()...build());
    }
}
