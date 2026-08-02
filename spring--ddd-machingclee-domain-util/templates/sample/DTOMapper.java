package {{basePackage}}.common.jpa;

import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

/**
 * MapStruct mapper for entity ↔ nested DTOs (Style A).
 * <p>
 * Required annotation shape:
 * {@code @Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)}
 * <ul>
 *   <li>{@code componentModel = "spring"} — inject into handlers (never {@code Mappers.getMapper})</li>
 *   <li>{@code unmappedTargetPolicy = ERROR} — fail compile on forgotten target fields</li>
 * </ul>
 * Extend this interface as new entities/views appear. Use {@code @Mapping} /
 * {@code @AfterMapping} when automatic mapping is incomplete.
 */
@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface DTOMapper {

    {{Entity}}.DTO toDTO({{Entity}} entity);

    {{Entity}}.FrontendListDTO toFrontendListDTO({{Entity}} entity);

    {{Entity}}.FrontendSingleDTO toFrontendSingleDTO({{Entity}} entity);
}
