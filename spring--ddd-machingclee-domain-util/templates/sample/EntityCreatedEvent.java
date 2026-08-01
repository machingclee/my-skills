package {{basePackage}}.context.{{context}}.event;

/**
 * Raised after a {{Entity}} is created.
 */
public record {{Entity}}CreatedEvent(
        Integer id,
        String name
) {
}
