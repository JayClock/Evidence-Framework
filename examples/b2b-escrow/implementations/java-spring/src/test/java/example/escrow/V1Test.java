package example.escrow;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {"escrow.test-mode=true", "escrow.mode=v1", "logging.level.root=ERROR"})
@AutoConfigureMockMvc
class V1Test {
  @Autowired MockMvc mvc;

  @Test
  void milestoneIsNotAvailable() throws Exception {
    assertEquals(
        404,
        mvc.perform(
                post("/fulfillment/fulfillment/x/first-milestone/request")
                    .header("x-evidence-role", "role.fulfillment-buyer"))
            .andReturn()
            .getResponse()
            .getStatus());
  }
}
