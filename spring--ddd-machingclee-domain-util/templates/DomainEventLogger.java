package {{basePackage}}.common.domainutils.{{context}};

import com.machingclee.domain.util.common.event.DomainEventLogger;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Context}}Event;
import {{basePackage}}.common.jpa.repository.{{Context}}EventRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

/**
 * Persists domain events raised during command handling.
 * Prefer a single DomainEventLogger bean per application to avoid double-writes.
 * Storage location = {@link {{Context}}Event} {@code @Table} + this repository.
 */
@Component
public class {{Context}}DomainEventLogger extends DomainEventLogger {
    public {{Context}}DomainEventLogger(
            {{Context}}EventRepository eventRepository,
            ApplicationEventPublisher publisher
    ) {
        super(eventRepository, {{Context}}Event::new, publisher);
    }
}
