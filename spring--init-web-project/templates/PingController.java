package {{basePackage}}.controller;

import {{basePackage}}.common.dto.APIResponseDTO;
import {{basePackage}}.common.interceptor.LogInvocation;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Smoke-test endpoint. Proof that the skeleton boots and the response envelope
 * (and request-logging interceptor) are wired correctly. Safe to delete once the
 * project has real controllers.
 */
@Tag(name = "00 Ping", description = "Liveness probe")
@RestController
@RequestMapping("/ping")
@LogInvocation
public class PingController {

    @GetMapping
    @Operation(summary = "Liveness check")
    public APIResponseDTO<String> ping() {
        return APIResponseDTO.success("pong");
    }
}
