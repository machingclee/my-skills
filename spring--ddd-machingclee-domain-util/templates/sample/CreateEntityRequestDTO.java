package {{basePackage}}.common.dto.request;

import lombok.Data;

/**
 * HTTP write body (Style B — free-standing under {@code common.dto.request}).
 * <p>
 * Controllers accept this as {@code @RequestBody}, then build a Command.
 * Do <strong>not</strong> nest request DTOs on the JPA entity.
 * Handlers should depend on the Command, not on this type.
 */
@Data
public class Create{{Entity}}DTO {
    private String name;
}
