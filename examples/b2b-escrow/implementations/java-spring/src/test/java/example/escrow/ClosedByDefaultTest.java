package example.escrow;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"logging.level.root=ERROR"})
@AutoConfigureMockMvc
class ClosedByDefaultTest {
  @Autowired MockMvc mvc;

  @Test
  void testHeadersDoNotEnableProductionAccess() throws Exception {
    assertEquals(
        503,
        mvc.perform(
                post("/procurement/agreement").header("x-evidence-role", "role.procurement-buyer"))
            .andReturn()
            .getResponse()
            .getStatus());
  }
}
