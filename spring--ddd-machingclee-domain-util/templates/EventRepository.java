package {{basePackage}}.common.jpa.repository;

import com.machingclee.domain.util.common.interfaces.AuditEventRepository;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Context}}Event;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * Repository for {@link {{Context}}Event}.
 * {@link AuditEventRepository} already declares {@code findAllByRequestId}.
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
