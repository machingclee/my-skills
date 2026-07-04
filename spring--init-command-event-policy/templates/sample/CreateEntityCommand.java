package {{basePackage}}.context.{{context}}.command;

import com.echarge.domainutil.common.interfaces.Command;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};
import lombok.Builder;
import lombok.Data;

/**
 * Write request that creates a {{Entity}}.
 *
 * The generic parameter ({@code Command<{{Entity}}.DTO>}) declares the handler's
 * return type, so {@code {{Context}}CommandInvoker.invoke(cmd)} is fully typed with no cast.
 * Carry only the inputs the handler needs here — never the whole request body DTO.
 */
@Data
@Builder
public class Create{{Entity}}Command implements Command<{{Entity}}.DTO> {
    private String name;
}
