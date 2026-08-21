package {{basePackage}}.common.domainutils.{{context}};

import com.machingclee.domain.util.common.command.AbstractCommandInvoker;
import com.machingclee.domain.util.common.interfaces.DomainEventDispatcher;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Context}}Event;
import {{basePackage}}.common.jpa.repository.{{Context}}EventRepository;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Optional override. Auto-config already creates {@code CustomCommandInvoker}
 * when there is a single {@link {{Context}}EventRepository}. Use this class only
 * for multi-PU apps or custom wiring.
 *
 * Orchestration lives in {@link AbstractCommandInvoker}.
 * Physical storage is controlled by {@link {{Context}}Event}'s {@code @Table}.
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
