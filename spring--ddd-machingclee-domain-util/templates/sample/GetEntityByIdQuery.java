package {{basePackage}}.context.{{context}}.query;

import com.machingclee.domain.util.annotation.BoundedContext;
import com.machingclee.domain.util.common.query.interfaces.Query;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};

/**
 * Read-only query: load a single {{Entity}} by id (typically mapped to GET).
 * <p>
 * Queries do not produce domain events or command audit rows.
 * {@code DefaultQueryInvoker} auto-registers all {@code QueryHandler} beans.
 */
@BoundedContext("{{BoundedContextName}}")
public record Get{{Entity}}ByIdQuery(
        Integer id
) implements Query<{{Entity}}.DTO> {
}
