package {{basePackage}}.controller;

import {{basePackage}}.common.domainutils.{{context}}.{{Context}}CommandInvoker;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};
import {{basePackage}}.context.{{context}}.command.Create{{Entity}}Command;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/{{context}}")
public class {{Entity}}Controller {

    private final {{Context}}CommandInvoker invoker;

    public {{Entity}}Controller({{Context}}CommandInvoker invoker) {
        this.invoker = invoker;
    }

    public record CreateRequest(String name) {}

    @PostMapping
    public {{Entity}}.DTO create(@RequestBody CreateRequest body) throws Exception {
        return invoker.invoke(new Create{{Entity}}Command(body.name()));
    }
}
