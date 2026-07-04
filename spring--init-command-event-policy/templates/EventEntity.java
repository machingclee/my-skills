package {{basePackage}}.common.jpa.entity.{{context}};

import com.echarge.domainutil.common.interfaces.AuditEvent;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.DynamicInsert;
import org.hibernate.annotations.DynamicUpdate;

/**
 * Audit-event entity for the {{context}} schema.
 *
 * Implements domain.util's {@link AuditEvent} so that {@code {{Context}}CommandAuditor}
 * and {@code {{Context}}DomainEventLogger} can persist commands/events generically.
 * The CustomCommandAuditor serialises each Command/Event to JSON into {@code payload}
 * and writes one row per invocation, success or failure.
 *
 * NOTE — the table does not have to exist yet to compile and boot:
 *   • With spring.jpa.hibernate.ddl-auto=none the app starts fine; persistence only
 *     fails at runtime on the first Command invoke, until the table is created.
 *   • Run templates/ddl/event-table.sql against the {{context}} schema to create it.
 *   • Do NOT switch to ddl-auto=validate until the table exists (Hibernate would
 *     fail the schema-validity check at startup).
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@DynamicInsert
@DynamicUpdate
@Table(name = "event", catalog = "{{context}}")
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class {{Context}}Event implements AuditEvent {

    //region all columns
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Integer id;

    @Column(name = "created_at")
    private Double createdAt;

    @Column(name = "request_id")
    private String requestId;

    @Column(name = "event_type")
    private String eventType;

    @Column(name = "payload", columnDefinition = "TEXT")
    private String payload;

    @Column(name = "event_order")
    private Integer eventOrder;

    @Column(name = "request_user_email")
    private String requestUserEmail;

    @Column(name = "success")
    private Boolean success;

    @Column(name = "failure_reason", columnDefinition = "MEDIUMTEXT")
    private String failureReason = "";
    //endregion

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class DTO {
        private Integer id;
        private Double createdAt;
        private String requestId;
        private String eventType;
        private String payload;
        private Integer eventOrder;
        private String requestUserEmail;
        private Boolean success;
        private String failureReason;
    }
}
