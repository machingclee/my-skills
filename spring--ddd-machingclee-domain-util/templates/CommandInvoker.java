package {{basePackage}}.common.domainutils.{{context}};

import com.machingclee.domain.util.common.command.AbstractCommandInvoker;
import com.machingclee.domain.util.common.interfaces.DomainEventDispatcher;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Context}}Event;
import {{basePackage}}.common.jpa.repository.{{Context}}EventRepository;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Entry point for executing Commands.
 * Orchestration (tx, audit, event dispatch) lives in {@link AbstractCommandInvoker}.
 * This subclass only injects auditor + event repository + transaction manager.
 * Physical storage is controlled by {@link {{Context}}Event}'s {@code @Table}.
 *
 * Registers all CommandHandler beans in the application context (single pipeline).
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
                auditor,
                eventRepository
        );
    }
}
