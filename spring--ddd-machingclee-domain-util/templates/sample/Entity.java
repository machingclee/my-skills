package {{basePackage}}.common.jpa.entity.{{context}};

import jakarta.persistence.*;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

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

    public DTO toDto() {
        return new DTO(id, name);
    }

    public record DTO(Integer id, String name) {}
}
