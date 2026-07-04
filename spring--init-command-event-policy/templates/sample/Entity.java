package {{basePackage}}.common.jpa.entity.{{context}};

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

/**
 * Sample JPA aggregate for the {{context}} bounded context.
 *
 * Convention (from web.sales): the entity carries a nested static {@link DTO} class.
 * Commands return the DTO — never the managed entity — so callers receive a stable,
 * detached snapshot of the persisted state.
 *
 * Adapt the fields below to the real aggregate; the Create{{Entity}}Command /
 * {{Entity}}CreatedEvent templates read only {@code id} and {@code createdAt}.
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "{{tableName}}", catalog = "{{context}}")
public class {{Entity}} {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "name")
    private String name;

    @Column(name = "created_at")
    @CreationTimestamp
    private Instant createdAt;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class DTO {
        private Integer id;
        private String name;
        private Instant createdAt;
    }
}
