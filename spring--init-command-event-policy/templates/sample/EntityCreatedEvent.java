package {{basePackage}}.context.{{context}}.event;

import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};
import lombok.Builder;
import lombok.Data;

/**
 * Domain event signalling that a {{Entity}} was created.
 *
 * This is a plain POJO placed on the EventQueue by the command handler — it carries
 * only the post-state DTO. It is NOT a JPA entity and maps to no table; the framework
 * serialises it into the audit {{Context}}Event.payload column and re-publishes it as a
 * Spring ApplicationEvent so that {@code @EventListener} methods (Policies) can react.
 */
@Data
@Builder
public class {{Entity}}CreatedEvent {
    private {{Entity}}.DTO {{entity}}DTO;
}
