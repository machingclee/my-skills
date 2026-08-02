package {{basePackage}}.common.jpa.entity.{{context}};

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Aggregate root with nested DTOs (Style A).
 * <p>
 * Prefer {@code DTOMapper.toDTO(entity)} over hand-written mapping when MapStruct
 * is available. Nested {@code DTO} / view types stay on the entity; HTTP request
 * bodies go in {@code common.dto.request} (Style B).
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "{{tableName}}")
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class {{Entity}} {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Integer id;

    @Column(nullable = false)
    private String name;

    // region DTOs (Style A — nested on entity)
    @Data
    public static class DTO {
        private Integer id;
        private String name;
    }

    /** Optional list/detail views for GET APIs. */
    @Data
    public static class FrontendListDTO {
        private Integer id;
        private String name;
    }

    @Data
    public static class FrontendSingleDTO {
        private Integer id;
        private String name;
    }
    // endregion
}
