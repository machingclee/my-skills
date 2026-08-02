package {{basePackage}}.context.{{context}}.event;

/**
 * Domain event raised after a {{Entity}} is created.
 * <p>
 * Plain POJO/record — no library base type required. Handlers publish via
 * {@code EventQueue.add(...)} / {@code addTransactional(...)}. Policies listen with
 * {@code @EventListener} on this concrete type (not {@code EventWrapper}).
 */
public record {{Entity}}CreatedEvent(
        Integer id,
        String name
) {
}
