package {{basePackage}}.context.{{context}}.command;

import com.machingclee.domain.util.annotation.Actor;
import com.machingclee.domain.util.annotation.BoundedContext;
import com.machingclee.domain.util.common.interfaces.Command;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};

/**
 * Create a new {{Entity}}.
 * <p>
 * {@code @BoundedContext} / {@code @Actor} are optional at runtime but surface in
 * the /docs command-flow visualizer. They do not route handlers.
 */
@BoundedContext("{{BoundedContextName}}")
@Actor("{{ActorName}}")
public record Create{{Entity}}Command(
        String name
) implements Command<{{Entity}}.DTO> {
}
