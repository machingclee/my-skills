package {{basePackage}}.controller;

import com.machingclee.domain.util.common.query.interfaces.QueryInvoker;
import {{basePackage}}.common.domainutils.{{context}}.{{Context}}CommandInvoker;
import {{basePackage}}.common.dto.request.Create{{Entity}}DTO;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};
import {{basePackage}}.context.{{context}}.command.Create{{Entity}}Command;
import {{basePackage}}.context.{{context}}.query.Get{{Entity}}ByIdQuery;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Thin controller: HTTP → Command/Query → invoker.
 * <ul>
 *   <li>Writes: Style B request DTO → Command → {@code commandInvoker.invoke}</li>
 *   <li>Reads: Query → {@code queryInvoker.invoke} (returns Style A {@code Entity.DTO})</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/{{context}}")
public class {{Entity}}Controller {

    private final {{Context}}CommandInvoker commandInvoker;
    private final QueryInvoker queryInvoker;

    public {{Entity}}Controller({{Context}}CommandInvoker commandInvoker,
                                QueryInvoker queryInvoker) {
        this.commandInvoker = commandInvoker;
        this.queryInvoker = queryInvoker;
    }

    @PostMapping
    public {{Entity}}.DTO create(@RequestBody Create{{Entity}}DTO body) throws Exception {
        return commandInvoker.invoke(new Create{{Entity}}Command(body.getName()));
    }

    @GetMapping("/{id}")
    public {{Entity}}.DTO getById(@PathVariable Integer id) throws Exception {
        return queryInvoker.invoke(new Get{{Entity}}ByIdQuery(id));
    }
}
