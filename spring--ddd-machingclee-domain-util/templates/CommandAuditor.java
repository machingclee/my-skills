package {{basePackage}}.common.domainutils.{{context}};

import com.machingclee.domain.util.common.command.CustomCommandAuditor;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Context}}Event;
import {{basePackage}}.common.jpa.repository.{{Context}}EventRepository;
import org.springframework.stereotype.Component;

/**
 * Optional override. Auto-config already creates {@code CustomCommandAuditor}
 * when there is a single {@link {{Context}}EventRepository}.
 * Persists one {{Context}}Event row per command in REQUIRES_NEW transactions.
 */
@Component
public class {{Context}}CommandAuditor extends CustomCommandAuditor<{{Context}}Event> {
    public {{Context}}CommandAuditor({{Context}}EventRepository eventRepository) {
        super(eventRepository, {{Context}}Event::new);
    }
}
