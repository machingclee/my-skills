package {{basePackage}}.common.domainutils.{{context}};

import com.echarge.domainutil.common.DomainEventLogger;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Context}}Event;
import {{basePackage}}.common.jpa.repository.{{Context}}EventRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

/**
 * Persists domain events emitted onto the EventQueue for the {{context}} schema.
 *
 * The framework publishes every queued event as a Spring ApplicationEvent wrapped in
 * an EventWrapper that carries its origin schema; this listener matches on
 * {{Context}}Schema.{{SCHEMA}} and writes a {{Context}}Event row, then re-publishes the
 * event so {@code @EventListener} Policies in the {{context}} bounded context react to it.
 *
 * As with the auditor, persistence requires the {@code event} table to exist — see
 * templates/ddl/event-table.sql. Bean wiring still boots without it (ddl-auto=none).
 */
@Component
public class {{Context}}DomainEventLogger extends DomainEventLogger {
    public {{Context}}DomainEventLogger(
            {{Context}}EventRepository eventRepository,
            ApplicationEventPublisher publisher
    ) {
        super(eventRepository, {{Context}}Event::new, {{Context}}Schema.{{SCHEMA}}, publisher);
    }
}
