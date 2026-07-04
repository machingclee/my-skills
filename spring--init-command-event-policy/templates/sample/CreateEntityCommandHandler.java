package {{basePackage}}.context.{{context}}.commandhandler;

import com.echarge.domainutil.common.interfaces.CommandHandler;
import com.echarge.domainutil.common.interfaces.EventQueue;
import com.echarge.domainutil.schema.TargetSchema;
import {{basePackage}}.common.domainutils.{{context}}.{{Context}}Schema;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};
import {{basePackage}}.common.jpa.repository.{{Entity}}Repository;
import {{basePackage}}.context.{{context}}.command.Create{{Entity}}Command;
import {{basePackage}}.context.{{context}}.event.{{Entity}}CreatedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Handles {@link Create{{Entity}}Command} for the {{context}} schema.
 *
 * The {@code @TargetSchema({{Context}}Schema.class)} annotation is how
 * {{Context}}CommandInvoker finds this handler at startup — every handler in this
 * bounded context must carry it so it is routed to the correct invoker.
 *
 * Flow: persist the aggregate → map to its DTO → publish a {{Entity}}CreatedEvent
 * onto the EventQueue → return the DTO. The framework wraps this in a transaction,
 * audits the command, and dispatches the event to listeners (incl. the Policy) after
 * the handler returns.
 */
@Component
@TargetSchema({{Context}}Schema.class)
@RequiredArgsConstructor
public class Create{{Entity}}CommandHandler
        implements CommandHandler<Create{{Entity}}Command, {{Entity}}.DTO> {

    private final {{Entity}}Repository {{entity}}Repository;

    @Override
    public {{Entity}}.DTO handle(EventQueue eventQueue, Create{{Entity}}Command command) throws Exception {
        {{Entity}} entity = new {{Entity}}();
        entity.setName(command.getName());

        {{Entity}} saved = {{entity}}Repository.save(entity);

        {{Entity}}.DTO dto = {{Entity}}.DTO.builder()
                .id(saved.getId())
                .name(saved.getName())
                .createdAt(saved.getCreatedAt())
                .build();

        eventQueue.add({{Entity}}CreatedEvent.builder().{{entity}}DTO(dto).build());
        return dto;
    }
}
