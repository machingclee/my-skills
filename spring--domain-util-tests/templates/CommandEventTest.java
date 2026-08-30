package com.example.project.testcontainerdb;

import com.echarge.domain.util.common.interfaces.CommandInvoker;
import com.example.project.common.jpa.entity.SalesEvent;
import com.example.project.common.jpa.repository.SalesEventRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;

import java.lang.invoke.SerializedLambda;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

public abstract class CommandEventTest extends BaseTest {

    @Autowired
    protected CommandInvoker commandInvoker;

    @Autowired
    protected SalesEventRepository eventRepository;

    protected final ObjectMapper objectMapper = new ObjectMapper();

    // ── event-table helpers ──────────────────────────────────────────

    /** All success domain-event rows for the given event simple name. */
    protected List<SalesEvent> findDomainEvents(String eventType) {
        return eventRepository.findByEventTypeAndSuccess(eventType, true);
    }

    /** Class-based variant: derives the type string with Class#getSimpleName(). */
    protected List<SalesEvent> findDomainEvents(Class<?> eventType) {
        return findDomainEvents(eventType.getSimpleName());
    }

    /** Asserts exactly one success row exists for the event type and returns it. */
    protected SalesEvent requireSingleDomainEvent(String eventType) {
        List<SalesEvent> events = findDomainEvents(eventType);
        assertThat(events).as("domain event %s", eventType).hasSize(1);
        return events.get(0);
    }

    /** Class-based variant of requireSingleDomainEvent(String). */
    protected SalesEvent requireSingleDomainEvent(Class<?> eventType) {
        return requireSingleDomainEvent(eventType.getSimpleName());
    }

    /** All success rows for the event type whose requestId matches. */
    protected List<SalesEvent> findDomainEvents(String eventType, String requestId) {
        return eventRepository.findAllByRequestIdAndEventType(requestId, eventType).stream()
                .filter(e -> Boolean.TRUE.equals(e.getSuccess()))
                .toList();
    }

    /** Class-based variant of findDomainEvents(String, String). */
    protected List<SalesEvent> findDomainEvents(Class<?> eventType, String requestId) {
        return findDomainEvents(eventType.getSimpleName(), requestId);
    }

    /** Asserts exactly one success row within the given requestId and returns it. */
    protected SalesEvent requireSingleDomainEvent(String eventType, String requestId) {
        List<SalesEvent> events = findDomainEvents(eventType, requestId);
        assertThat(events).as("domain event %s with requestId %s", eventType, requestId).hasSize(1);
        return events.get(0);
    }

    /** Class-based variant of requireSingleDomainEvent(String, String). */
    protected SalesEvent requireSingleDomainEvent(Class<?> eventType, String requestId) {
        return requireSingleDomainEvent(eventType.getSimpleName(), requestId);
    }

    /**
     * Deserializes the event payload column directly into the typed event
     * class, so assertions use real getters with compile-time checked field
     * names. The event classes are annotated @Builder @Jacksonized, which
     * makes Lombok generate a Jackson @JsonCreator on the builder's all-args
     * constructor — no default constructor needed.
     */
    protected <T> T safeParse(SalesEvent event, Class<T> eventType) {
        try {
            return objectMapper.readValue(event.getPayload(), eventType);
        } catch (Exception e) {
            throw new AssertionError("Failed to parse payload of " + event.getEventType()
                    + " (requestId=" + event.getRequestId() + ") into " + eventType.getSimpleName()
                    + ": " + e.getMessage() + "\npayload: " + abbreviate(event.getPayload(), 500), e);
        }
    }

    private static String abbreviate(String text, int max) {
        if (text == null) {
            return "null";
        }
        return text.length() <= max ? text : text.substring(0, max) + "...";
    }

    // ── DTO non-null assertions ──────────────────────────────────────

    /**
     * Reflectively asserts every direct field of the DTO (and its superclass
     * chain, skipping static) is non-null, skipping the named excluded fields.
     */
    protected void assertDtoNonNull(Object dto, String... excluded) {
        assertDtoNonNull(dto, java.util.Arrays.asList(excluded));
    }

    /** Getter-based variant: excluded fields as method references, no strings. */
    protected void assertDtoNonNull(Object dto, Getter<?, ?> first, Getter<?, ?>... rest) {
        List<String> names = new java.util.ArrayList<>(rest.length + 1);
        names.add(fieldName(first));
        for (Getter<?, ?> getter : rest) {
            names.add(fieldName(getter));
        }
        assertDtoNonNull(dto, names);
    }

    /** Getter-based variant with a base Getter array plus extra getters. */
    protected void assertDtoNonNull(Object dto, Getter<?, ?>[] first, Getter<?, ?>... rest) {
        List<String> names = new java.util.ArrayList<>(first.length + rest.length);
        for (Getter<?, ?> getter : first) {
            names.add(fieldName(getter));
        }
        for (Getter<?, ?> getter : rest) {
            names.add(fieldName(getter));
        }
        assertDtoNonNull(dto, names);
    }

    private void assertDtoNonNull(Object dto, java.util.List<String> exclusionList) {
        Set<String> exclusions = new java.util.HashSet<>(exclusionList);
        for (Class<?> clazz = dto.getClass(); clazz != null && clazz != Object.class; clazz = clazz.getSuperclass()) {
            for (Field field : clazz.getDeclaredFields()) {
                if (Modifier.isStatic(field.getModifiers())) {
                    continue;
                }
                if (exclusions.contains(field.getName())) {
                    continue;
                }
                field.setAccessible(true);
                try {
                    assertThat(field.get(dto))
                            .as("%s.%s must not be null", dto.getClass().getSimpleName(), field.getName())
                            .isNotNull();
                } catch (IllegalAccessException e) {
                    throw new IllegalStateException(e);
                }
            }
        }
    }

    /**
     * Walks the JSON tree of a serialized event/DTO and asserts no field value
     * is JSON null, except fields whose name is in the allowed set. Nested
     * objects and array elements are checked recursively.
     */
    protected void assertDtoJsonNonNull(JsonNode node, String... allowedNullFields) {
        assertDtoJsonNonNull(node, java.util.Arrays.asList(allowedNullFields));
    }

    /** Same walk, accepting a typed event/DTO (serialized internally). */
    protected void assertDtoJsonNonNull(Object dtoOrEvent, String... allowedNullFields) {
        assertDtoJsonNonNull(objectMapper.valueToTree(dtoOrEvent), allowedNullFields);
    }

    /** Getter-based variant: allowed-null fields as method references. */
    protected void assertDtoJsonNonNull(Object dtoOrEvent, Getter<?, ?> first, Getter<?, ?>... rest) {
        List<String> names = new java.util.ArrayList<>(rest.length + 1);
        names.add(fieldName(first));
        for (Getter<?, ?> getter : rest) {
            names.add(fieldName(getter));
        }
        assertDtoJsonNonNull(objectMapper.valueToTree(dtoOrEvent), names.toArray(String[]::new));
    }

    /** Getter-based variant with a base Getter array plus extra getters. */
    protected void assertDtoJsonNonNull(Object dtoOrEvent, Getter<?, ?>[] first, Getter<?, ?>... rest) {
        List<String> names = new java.util.ArrayList<>(first.length + rest.length);
        for (Getter<?, ?> getter : first) {
            names.add(fieldName(getter));
        }
        for (Getter<?, ?> getter : rest) {
            names.add(fieldName(getter));
        }
        assertDtoJsonNonNull(objectMapper.valueToTree(dtoOrEvent), names.toArray(String[]::new));
    }

    /**
     * Serialization-friendly functional interface for getter method references.
     * Getter.of(DTO::getFoo) infers the declaring type and widens to Getter<?, ?>.
     */
    @FunctionalInterface
    public interface Getter<T, R> extends java.util.function.Function<T, R>, java.io.Serializable {
        static <T, R> Getter<?, ?> of(Getter<T, R> getter) {
            return getter;
        }
    }

    /**
     * Derives the DTO field name from a stateless getter method reference, e.g.
     * SellingOffer.DTO::getStartDate becomes "startDate", Notification.DTO::getIsRead
     * becomes "isRead".
     */
    protected static String fieldName(Getter<?, ?> getter) {
        try {
            Method writeReplace = getter.getClass().getDeclaredMethod("writeReplace");
            writeReplace.setAccessible(true);
            SerializedLambda lambda = (SerializedLambda) writeReplace.invoke(getter);
            String method = lambda.getImplMethodName();
            if (method.startsWith("get")) {
                return decap(method.substring(3));
            }
            if (method.startsWith("is")) {
                return decap(method.substring(2));
            }
            return method;
        } catch (Exception e) {
            throw new IllegalArgumentException("Not a stateless getter reference: " + getter, e);
        }
    }

    private static String decap(String s) {
        return s.isEmpty() ? s : Character.toLowerCase(s.charAt(0)) + s.substring(1);
    }

    private void assertDtoJsonNonNull(JsonNode node, java.util.List<String> allowedNullList) {
        Set<String> allowed = new java.util.HashSet<>(allowedNullList);
        assertNoNullLeaves(node, allowed, "$");
    }

    private void assertNoNullLeaves(JsonNode node, Set<String> allowed, String path) {
        if (node == null || node.isNull()) {
            return;
        }
        if (node.isObject()) {
            var fields = node.fields();
            while (fields.hasNext()) {
                var entry = fields.next();
                String childPath = path + "." + entry.getKey();
                if (entry.getValue().isNull()) {
                    if (!allowed.contains(entry.getKey())) {
                        throw new AssertionError(
                                "DTO field " + childPath + " must not be null (allowed null fields: " + allowed + ")");
                    }
                } else {
                    assertNoNullLeaves(entry.getValue(), allowed, childPath);
                }
            }
        } else if (node.isArray()) {
            for (JsonNode item : node) {
                assertNoNullLeaves(item, allowed, path + "[]");
            }
        }
    }
}
