package {{basePackage}}.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Full-context smoke test: boots the skeleton (web layer + routing DataSource +
 * the user.authentication library) and hits GET /ping.
 * <p>
 * <b>Prerequisites:</b> a MySQL instance on {@code localhost:3306} with the
 * configured schema reachable (the routing DataSource initialises HikariCP pools
 * against {@code app.datasource.*}), and {@code user.authentication}
 * installed to the local Maven repo.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class PingControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void pingReturnsPong() throws Exception {
        mockMvc.perform(get("/ping"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.result").value("pong"));
    }
}
