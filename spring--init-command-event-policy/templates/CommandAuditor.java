package {{basePackage}}.common.domainutils.{{context}};

import com.echarge.domainutil.common.CustomCommandAuditor;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Context}}Event;
import {{basePackage}}.common.jpa.repository.{{Context}}EventRepository;
import org.springframework.stereotype.Component;

/**
 * Persists one {{Context}}Event row per Command/Event in a REQUIRES_NEW transaction,
 * so the audit trail survives even when the surrounding command rolls back.
 *
 * Delegates all logic to {@link CustomCommandAuditor}; this bean only binds the
 * concrete entity factory ({{Context}}Event::new) and repository.
 */
@Component
public class {{Context}}CommandAuditor extends CustomCommandAuditor<{{Context}}Event> {
    public {{Context}}CommandAuditor({{Context}}EventRepository {{context}}EventRepository) {
        super({{context}}EventRepository, {{Context}}Event::new);
    }
}
