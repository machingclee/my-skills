package {{basePackage}}.context.{{context}}.commandhandler;

import com.machingclee.domain.util.common.interfaces.CommandHandler;
import com.machingclee.domain.util.common.interfaces.EventQueue;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};
import {{basePackage}}.common.jpa.repository.{{Entity}}Repository;
import {{basePackage}}.context.{{context}}.command.Create{{Entity}}Command;
import {{basePackage}}.context.{{context}}.event.{{Entity}}CreatedEvent;
import org.springframework.stereotype.Component;

@Component
public class Create{{Entity}}CommandHandler
        implements CommandHandler<Create{{Entity}}Command, {{Entity}}.DTO> {

    private final {{Entity}}Repository repository;

    public Create{{Entity}}CommandHandler({{Entity}}Repository repository) {
        this.repository = repository;
    }

    @Override
    public {{Entity}}.DTO handle(EventQueue eventQueue, Create{{Entity}}Command command) {
        {{Entity}} entity = new {{Entity}}();
        entity.setName(command.name());
        repository.save(entity);

        eventQueue.add(new {{Entity}}CreatedEvent(entity.getId(), entity.getName()));

        return entity.toDto();
    }
}
