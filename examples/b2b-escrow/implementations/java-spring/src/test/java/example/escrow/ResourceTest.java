package example.escrow;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class ResourceTest {
  private final HttpTest app;

  ResourceTest() {
    var env = new MockEnvironment().withProperty("escrow.test-mode", "true");
    app = new HttpTest();
    app.json = new ObjectMapper();
    app.mvc =
        MockMvcBuilders.standaloneSetup(new EscrowController(new EscrowService(), app.json, env))
            .addFilters(new RequestContextFilter(env, app.json))
            .build();
  }

  private JsonNode read(String path, String role) throws Exception {
    var response = app.call("GET", path, role, HttpTest.WHEN, null).getResponse();
    assertEquals(200, response.getStatus(), response.getContentAsString());
    assertEquals("application/hal+json", response.getContentType());
    assertNull(response.getHeader("Location"));
    return app.json.readTree(response.getContentAsString());
  }

  @Test
  void halCollectionsAndScopedPrimaryReads() throws Exception {
    for (var entry :
        Map.of(
                "agreements", "role.procurement-buyer",
                "escrows", "role.escrow-buyer",
                "fulfillments", "role.fulfillment-seller",
                "settlements", "role.settlement-escrow")
            .entrySet()) {
      String name = entry.getKey();
      assertEquals(
          app.json.valueToTree(
              Map.of(
                  "_links",
                  Map.of("self", Map.of("href", "/" + name)),
                  "_embedded",
                  Map.of(name, List.of()),
                  "total",
                  0)),
          read("/" + name, entry.getValue()));
    }
    String buyer = "role.procurement-buyer", seller = "role.procurement-seller";
    var a = app.postOk("/agreements", buyer, app.terms("a b"));
    app.postOk("/agreements", buyer, app.terms("b"));
    assertEquals("/agreements/a%20b", a.path("_links").path("self").path("href").asText());
    var contracts = read("/agreements", buyer);
    assertEquals(2, contracts.path("total").asInt());
    assertEquals(2, contracts.path("_embedded").path("agreements").size());
    String path = "/agreements/a%20b/orders";
    var empty = read(path, buyer);
    assertEquals(0, empty.path("total").asInt());
    assertTrue(empty.path("_embedded").path("orders").isArray());
    assertEquals(0, empty.path("_embedded").path("orders").size());
    var request = app.postOk(path, buyer, Map.of("id", "req"));
    assertEquals(
        app.json.valueToTree(
            Map.of(
                "_links",
                Map.of("self", Map.of("href", path)),
                "_embedded",
                Map.of("orders", List.of(request)),
                "total",
                1)),
        read(path, buyer));
    assertEquals(0, read("/agreements/b/orders", buyer).path("total").asInt());
    String confirmation = path + "/req/confirmation";
    assertEquals(
        404, app.call("GET", confirmation, seller, HttpTest.WHEN, null).getResponse().getStatus());
    app.postOk(confirmation, seller, Map.of("id", "confirmed"));
    record Check(String path, String role, int status) {}
    for (var check :
        List.of(
            new Check("/agreements/b/orders/req", buyer, 404),
            new Check("/agreements/b/orders/req/confirmation", seller, 404),
            new Check("/agreements/a%20b/commitments/req", seller, 404),
            new Check("/agreements/a%20b/commitments/req/confirmation", buyer, 404),
            new Check("/agreements/missing/orders", buyer, 404),
            new Check("/escrows/a%20b", "role.escrow-buyer", 404),
            new Check(path + "/req", seller, 403),
            new Check(confirmation, buyer, 403),
            new Check("/agreements", "role.escrow-buyer", 403),
            new Check("/unknown", buyer, 404),
            new Check("/agreements/b/unknown", buyer, 404))) {
      assertEquals(
          check.status(),
          app.call("GET", check.path(), check.role(), HttpTest.WHEN, null)
              .getResponse()
              .getStatus(),
          check.path());
    }
  }
}
