package {{basePackage}}.common.domainutils.{{context}};

import com.machingclee.domain.util.common.event.DomainEventLogger;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Context}}Event;
import {{basePackage}}.common.jpa.repository.{{Context}}EventRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

/**
 * Optional override. Auto-config already creates {@code DomainEventLogger}
 * when there is a single {@link {{Context}}EventRepository}.
 * Prefer a single logger bean per application to avoid double-writes.
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
