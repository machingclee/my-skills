package {{basePackage}}.common.domainutils.{{context}};

import com.machingclee.domain.util.common.command.CustomCommandAuditor;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Context}}Event;
import {{basePackage}}.common.jpa.repository.{{Context}}EventRepository;
import org.springframework.stereotype.Component;

/**
 * Persists one {{Context}}Event row per command (and related audit helpers)
 * in REQUIRES_NEW transactions so the trail can survive outer rollbacks.
 */
@Component
public class {{Context}}CommandAuditor extends CustomCommandAuditor<{{Context}}Event> {
    public {{Context}}CommandAuditor({{Context}}EventRepository eventRepository) {
        super(eventRepository, {{Context}}Event::new);
    }
}
