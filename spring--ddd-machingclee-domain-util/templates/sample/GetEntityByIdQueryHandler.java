package {{basePackage}}.context.{{context}}.queryhandler;

import com.machingclee.domain.util.common.query.interfaces.QueryHandler;
import {{basePackage}}.common.jpa.DTOMapper;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};
import {{basePackage}}.common.jpa.repository.{{Entity}}Repository;
import {{basePackage}}.context.{{context}}.query.Get{{Entity}}ByIdQuery;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Handles {@link Get{{Entity}}ByIdQuery}.
 * <p>
 * Rules:
 * <ul>
 *   <li>Exactly one handler per query type</li>
 *   <li>Read-only — never mutate aggregates here</li>
 *   <li>No {@code EventQueue}; no domain events</li>
 *   <li>Map with {@code DTOMapper} (Style A nested DTO)</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
public class Get{{Entity}}ByIdQueryHandler
        implements QueryHandler<Get{{Entity}}ByIdQuery, {{Entity}}.DTO> {

    private final {{Entity}}Repository repository;
    private final DTOMapper dtoMapper;

    @Override
    @Transactional(readOnly = true)
    public {{Entity}}.DTO handle(Get{{Entity}}ByIdQuery query) {
        return repository.findById(query.id())
                .map(dtoMapper::toDTO)
                .orElse(null); // or throw a domain not-found exception
    }
}
