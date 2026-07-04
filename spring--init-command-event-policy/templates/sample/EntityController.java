package {{basePackage}}.controller;

import {{basePackage}}.common.domainutils.{{context}}.{{Context}}CommandInvoker;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};
import {{basePackage}}.context.{{context}}.command.Create{{Entity}}Command;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * Sample REST controller driving the command pipeline.
 *
 * It builds a Command from the request, hands it to {{Context}}CommandInvoker, and
 * returns the handler's result. The invoker (not the controller) owns the transaction,
 * audit log, event dispatch, and policy triggering — controllers stay thin.
 *
 * Adapt to your project:
 *   - Wrap the return in your standard envelope (e.g. APIResponseDTO.success(...)).
 *   - Add @AccessToken / @RequestUser if you use the echarge user.v2 security stack.
 *   - Add @LogRequest (spring--aop-request-logger) if you want per-controller logging.
 */
@RestController
@RequestMapping("/{{tablePath}}")
@RequiredArgsConstructor
public class {{Entity}}Controller {

    private final {{Context}}CommandInvoker {{context}}CommandInvoker;

    @PostMapping
    public {{Entity}}.DTO create(@RequestBody Create{{Entity}}Request body) throws Exception {
        Create{{Entity}}Command cmd = Create{{Entity}}Command.builder()
                .name(body.getName())
                .build();
        return {{context}}CommandInvoker.invoke(cmd);
    }

    /**
     * Minimal request body. In a real project this lives under
     * common.dto.request and carries validation annotations.
     */
    @lombok.Data
    public static class Create{{Entity}}Request {
        private String name;
    }
}
