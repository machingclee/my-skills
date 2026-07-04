package {{basePackage}}.common.domainutils.{{context}};

import com.echarge.domainutil.common.AbstractCommandInvoker;
import com.echarge.domainutil.common.interfaces.DomainEventDispatcher;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Context}}Event;
import {{basePackage}}.common.jpa.repository.{{Context}}EventRepository;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Entry point for executing Commands in the {{context}} schema.
 *
 * All shared orchestration (transaction handling, auditing, event dispatch, policy
 * triggering) lives in {@link AbstractCommandInvoker}; this subclass only injects the
 * four schema-specific dependencies (schema id, auditor, event repository, tx manager).
 *
 * Controllers and Policies invoke commands through this bean:
 *   <pre>
 *   {{Context}}CommandInvoker invoker;       // injected
 *   {{Entity}}.DTO result = invoker.invoke(new Create{{Entity}}Command(...));
 *   invoker.invoke(command);                 // also works — picked up by type
 *   </pre>
 *
 * Handlers are auto-discovered: any {@code @Component @TargetSchema({{Context}}Schema.class)}
 * CommandHandler implementation is registered here at startup.
 */
@Component
public class {{Context}}CommandInvoker extends AbstractCommandInvoker<{{Context}}Event> {

    public {{Context}}CommandInvoker(
            ApplicationContext context,
            DomainEventDispatcher domainEventDispatcher,
            PlatformTransactionManager transactionManager,
            {{Context}}CommandAuditor auditor,
            {{Context}}EventRepository eventRepository
    ) {
        super(
                context,
                domainEventDispatcher,
                transactionManager,
                {{Context}}Schema.{{SCHEMA}},
                auditor,
                eventRepository
        );
    }
}
