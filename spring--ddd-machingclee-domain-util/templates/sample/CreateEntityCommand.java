package {{basePackage}}.context.{{context}}.command;

import com.machingclee.domain.util.common.interfaces.Command;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};

/**
 * Create a new {{Entity}}.
 */
public record Create{{Entity}}Command(
        String name
) implements Command<{{Entity}}.DTO> {
}
