package {{basePackage}}.common.jpa.repository;

import com.echarge.domainutil.common.interfaces.AuditEventRepository;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Context}}Event;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * Repository for {@link {{Context}}Event}.
 *
 * Extends domain.util's {@link AuditEventRepository} (which already declares
 * {@code findAllByRequestId}) so the framework can persist audit rows generically.
 * Add schema-specific lookup queries here as needed.
 */
public interface {{Context}}EventRepository extends AuditEventRepository<{{Context}}Event> {

    List<{{Context}}Event> findAllByRequestIdAndEventType(String requestId, String eventType);

    @Query("""
        select e from {{Context}}Event e
        where (:requestId IS NULL OR e.requestId = :requestId)
          and (:success IS NULL OR e.success = :success)
        order by e.createdAt desc, e.eventOrder desc
    """)
    Page<{{Context}}Event> findByPageAndLimit(
            @Param("requestId") String requestId,
            @Param("success") Boolean success,
            Pageable pageable);
}
