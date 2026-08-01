package {{basePackage}}.common.jpa.repository;

import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};
import org.springframework.data.jpa.repository.JpaRepository;

public interface {{Entity}}Repository extends JpaRepository<{{Entity}}, Integer> {
}
