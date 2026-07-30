package com.example.app.controller;

import org.springframework.core.env.Environment;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/ping")
public class PingController {

    private final Environment env;

    public PingController(Environment env) {
        this.env = env;
    }

    @GetMapping
    public Map<String, String> pong() {
        return Map.of(
                "pong", env.getProperty("spring.application.name", "app"),
                "commitHash", env.getProperty("COMMIT_HASH", ""),
                "profiles", String.join(",", env.getActiveProfiles())
        );
    }
}
