package example.escrow;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class FaultTest {
  private final ObjectMapper json = new ObjectMapper();

  private MockMvc app(String fault, boolean testMode) {
    var env = new MockEnvironment().withProperty("escrow.fault", fault)
        .withProperty("escrow.test-mode", String.valueOf(testMode));
    return MockMvcBuilders.standaloneSetup(new EscrowController(new EscrowService(), json, env))
        .addFilters(new RequestContextFilter(env, json)).build();
  }

  private org.springframework.mock.web.MockHttpServletResponse call(
      MockMvc mvc, String path, String role, String clock, Object body) throws Exception {
    return mvc.perform(post(path).contentType("application/json")
        .header("x-evidence-role", role).header("x-evidence-asof", clock)
        .content(json.writeValueAsBytes(body))).andReturn().getResponse();
  }

  @ParameterizedTest
  @ValueSource(strings = {"none", "accept-derived", "extra-field", "clock", "precision"})
  void faultsAreExplicitAndTestOnly(String fault) throws Exception {
    var terms = new HttpTest().terms("fault");
    var path = "/agreements";
    var role = "role.procurement-buyer";
    assertEquals(503, call(app(fault, false), path, role, HttpTest.WHEN, terms).getStatus());
    var mvc = app(fault, true);
    var response = call(mvc, path, role, HttpTest.WHEN, terms);
    assertEquals(201, response.getStatus(), response.getContentAsString());
    var data = json.readTree(response.getContentAsString());
    assertEquals(fault.equals("extra-field"), data.path("unmodeled").asBoolean());
    assertEquals(fault.equals("clock"), !data.path("signed_at").asText().equals(HttpTest.WHEN));
    assertEquals(fault.equals("precision") ? "10000000000000000" : "10000000000000001",
        data.path("tier1_unit_price_minor").asText());
    assertEquals(403, call(mvc, path, "role.procurement-escrow", HttpTest.WHEN, terms).getStatus());
    assertEquals(400, call(mvc, path, role, "bad", terms).getStatus());
    var tamper = call(mvc, "/settlements/absent/releases/absent/confirmation",
        "role.settlement-escrow", HttpTest.WHEN, Map.of("id", "tamper", "payout_minor", 999999));
    assertEquals(fault.equals("accept-derived") ? 201 : 422, tamper.getStatus());
  }

  @Test
  void unknownFaultFailsClosed() {
    assertThrows(IllegalArgumentException.class, () -> app("unknown", true));
  }
}
