package {{basePackage}}.context.{{context}}.commandhandler;

import com.machingclee.domain.util.common.interfaces.CommandHandler;
import com.machingclee.domain.util.common.interfaces.EventQueue;
import {{basePackage}}.common.jpa.DTOMapper;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};
import {{basePackage}}.common.jpa.repository.{{Entity}}Repository;
import {{basePackage}}.context.{{context}}.command.Create{{Entity}}Command;
import {{basePackage}}.context.{{context}}.event.{{Entity}}CreatedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Handles {@link Create{{Entity}}Command}: persist aggregate, map via {@link DTOMapper}, enqueue domain event.
 * <p>
 * Rules:
 * <ul>
 *   <li>Exactly one handler per command type</li>
 *   <li>No {@code @TargetSchema} (does not exist in this library)</li>
 *   <li>{@code eventQueue.add} = IMMEDIATE; {@code addTransactional} = AFTER_COMMIT</li>
 *   <li>Map with MapStruct {@code DTOMapper} (nested {@code Entity.DTO}), not hand setters</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
public class Create{{Entity}}CommandHandler
        implements CommandHandler<Create{{Entity}}Command, {{Entity}}.DTO> {

    private final {{Entity}}Repository repository;
    private final DTOMapper dtoMapper;

    @Override
    public {{Entity}}.DTO handle(EventQueue eventQueue, Create{{Entity}}Command command) {
        {{Entity}} entity = new {{Entity}}();
        entity.setName(command.name());
        {{Entity}} saved = repository.save(entity);

        {{Entity}}.DTO dto = dtoMapper.toDTO(saved);

        // IMMEDIATE: policies + logger see this during the command transaction
        eventQueue.add(new {{Entity}}CreatedEvent(dto.getId(), dto.getName()));
        // AFTER_COMMIT example:
        // eventQueue.addTransactional(new {{Entity}}CreatedEvent(dto.getId(), dto.getName()));

        return dto;
    }
}
