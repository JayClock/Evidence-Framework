package example.escrow;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(
    properties = {"escrow.test-mode=true", "escrow.mode=v2", "logging.level.root=ERROR"})
@AutoConfigureMockMvc
class HttpTest {
  static final String WHEN = "2026-06-01T00:00:00Z";
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;

  Map<String, Object> terms(String id) {
    return new HashMap<>(
        Map.of(
            "id",
            id,
            "quantity",
            2,
            "tier_threshold",
            1000,
            "tier1_unit_price_minor",
            "10000000000000001",
            "tier2_unit_price_minor",
            1199,
            "tax_bps",
            1300,
            "retention_bps",
            500,
            "daily_penalty_bps",
            100,
            "delivery_deadline",
            WHEN));
  }

  MvcResult call(String method, String path, String role, String clock, Object body)
      throws Exception {
    var r = method.equals("GET") ? get(URI.create(path)) : post(URI.create(path));
    r.contentType("application/json");
    if (role != null) r.header("x-evidence-role", role);
    if (clock != null) r.header("x-evidence-asof", clock);
    if (body != null) r.content(json.writeValueAsBytes(body));
    return mvc.perform(r).andReturn();
  }

  JsonNode postOk(String path, String role, Object body) throws Exception {
    var r = call("POST", path, role, WHEN, body);
    assertEquals(201, r.getResponse().getStatus(), r.getResponse().getContentAsString());
    assertEquals("application/hal+json", r.getResponse().getContentType());
    var location = r.getResponse().getHeader("Location");
    assertNotNull(location);
    var data = json.readTree(r.getResponse().getContentAsString());
    assertEquals(location, data.path("_links").path("self").path("href").asText());
    var read = call("GET", location, role, WHEN, null).getResponse();
    assertEquals(200, read.getStatus(), read.getContentAsString());
    assertEquals(data, json.readTree(read.getContentAsString()));
    return data;
  }

  void order(String id) throws Exception {
    postOk("/agreements", "role.procurement-buyer", terms(id));
    String root = "/agreements/" + id;
    postOk(root + "/orders", "role.procurement-buyer", Map.of("id", id + "-request"));
    postOk(
        root + "/orders/" + id + "-request/confirmation",
        "role.procurement-seller",
        Map.of("id", id + "-order"));
    postOk(root + "/commitments", "role.procurement-seller", Map.of("id", id + "-commit"));
    postOk(
        root + "/commitments/" + id + "-commit/confirmation",
        "role.procurement-buyer",
        Map.of("id", id + "-committed", "acknowledged", true));
  }

  void deposit(String id) throws Exception {
    postOk(
        "/escrows",
        "role.escrow-buyer",
        Map.of("id", id + "-escrow", "order_confirmation_id", id + "-order"));
    String root = "/escrows/" + id + "-escrow";
    postOk(root + "/deposit-locks", "role.escrow-buyer", Map.of("id", id + "-lock"));
    postOk(
        root + "/deposit-locks/" + id + "-lock/confirmation",
        "role.escrow-escrow",
        Map.of("id", id + "-deposit"));
    postOk(root + "/custody-statements", "role.escrow-escrow", Map.of("id", id + "-statement"));
    postOk(
        root + "/custody-statements/" + id + "-statement/confirmation",
        "role.escrow-buyer",
        Map.of("id", id + "-custody", "acknowledged", true));
  }

  @Test
  void identityStrictInputGetAndExpiry() throws Exception {
    assertEquals(
        401, call("POST", "/agreements", null, WHEN, terms("security")).getResponse().getStatus());
    assertEquals(
        400,
        call(
                "POST",
                "/agreements",
                "role.procurement-buyer",
                "2026-02-30T00:00:00Z",
                terms("security"))
            .getResponse()
            .getStatus());
    assertEquals(
        403,
        call("POST", "/agreements", "role.escrow-buyer", WHEN, terms("security"))
            .getResponse()
            .getStatus());
    var body = terms("security");
    body.put("signed_at", WHEN);
    assertEquals(
        422,
        call("POST", "/agreements", "role.procurement-buyer", WHEN, body)
            .getResponse()
            .getStatus());
    for (Object invalid : List.of(true, 9007199254740992L, "9223372036854775808", 0)) {
      body = terms("security");
      body.put("quantity", invalid);
      assertEquals(
          422,
          call("POST", "/agreements", "role.procurement-buyer", WHEN, body)
              .getResponse()
              .getStatus());
    }
    postOk("/agreements", "role.procurement-buyer", terms("security"));
    assertEquals(
        200,
        call("GET", "/agreements/security", "role.procurement-seller", WHEN, null)
            .getResponse()
            .getStatus());
    assertEquals(
        409,
        call("POST", "/agreements", "role.procurement-buyer", WHEN, terms("security"))
            .getResponse()
            .getStatus());
    assertEquals(
        422,
        call(
                "POST",
                "/agreements/security/orders",
                "role.procurement-buyer",
                "2026-05-31T00:00:00Z",
                Map.of("id", "early"))
            .getResponse()
            .getStatus());
    postOk("/agreements/security/orders", "role.procurement-buyer", Map.of("id", "expiry"));
    assertEquals(
        422,
        call(
                "POST",
                "/agreements/security/orders/expiry/confirmation",
                "role.procurement-seller",
                "2026-06-03T00:00:01Z",
                Map.of("id", "expired"))
            .getResponse()
            .getStatus());
  }

  @Test
  void concurrentClockIsolation() throws Exception {
    try (var pool = Executors.newFixedThreadPool(8)) {
      List<Callable<Void>> work = new ArrayList<>();
      for (int i = 0; i < 20; i++) {
        final int n = i;
        work.add(
            () -> {
              String clock = "2026-06-01T00:00:%02dZ".formatted(n);
              var r =
                  call("POST", "/agreements", "role.procurement-buyer", clock, terms("clock-" + n));
              assertEquals(201, r.getResponse().getStatus());
              assertEquals(
                  clock,
                  json.readTree(r.getResponse().getContentAsString()).get("signed_at").asText());
              return null;
            });
      }
      for (var f : pool.invokeAll(work)) f.get();
    }
    assertThrows(NullPointerException.class, RequestContextFilter::current);
  }

  @Test
  void journeyCrossOrderAndAtomicRelease() throws Exception {
    for (String id : List.of("a", "b")) {
      order(id);
      deposit(id);
    }
    var linked =
        new HashMap<String, Object>(
            Map.of(
                "id",
                "fulfillment",
                "order_confirmation_id",
                "a-order",
                "deposit_confirmation_id",
                "b-deposit"));
    assertEquals(
        422,
        call("POST", "/fulfillments", "role.fulfillment-buyer", WHEN, linked)
            .getResponse()
            .getStatus());
    linked.put("deposit_confirmation_id", "a-deposit");
    postOk("/fulfillments", "role.fulfillment-buyer", linked);
    String root = "/fulfillments/fulfillment";
    postOk(root + "/deliveries", "role.fulfillment-buyer", Map.of("id", "delivery"));
    postOk(
        root + "/deliveries/delivery/confirmation",
        "role.fulfillment-seller",
        Map.of("id", "delivered", "delivered_quantity", 2));
    postOk(root + "/acceptances", "role.fulfillment-seller", Map.of("id", "accept"));
    postOk(
        root + "/acceptances/accept/confirmation",
        "role.fulfillment-buyer",
        Map.of("id", "accepted", "accepted", true));
    postOk(
        "/settlements",
        "role.settlement-seller",
        Map.of(
            "id",
            "settlement",
            "order_confirmation_id",
            "a-order",
            "deposit_confirmation_id",
            "a-deposit",
            "acceptance_confirmation_id",
            "accepted"));
    String path = "/settlements/settlement/releases";
    postOk(path, "role.settlement-seller", Map.of("id", "release"));
    assertEquals(
        422,
        call(
                "POST",
                path + "/release/confirmation",
                "role.settlement-escrow",
                WHEN,
                Map.of("id", "tamper", "payout_minor", 1))
            .getResponse()
            .getStatus());
    try (var pool = Executors.newFixedThreadPool(2)) {
      List<Callable<MvcResult>> work =
          List.of(
              () ->
                  call(
                      "POST",
                      path + "/release/confirmation",
                      "role.settlement-escrow",
                      WHEN,
                      Map.of("id", "released1")),
              () ->
                  call(
                      "POST",
                      path + "/release/confirmation",
                      "role.settlement-escrow",
                      WHEN,
                      Map.of("id", "released2")));
      var results =
          pool.invokeAll(work).stream()
              .map(
                  f -> {
                    try {
                      return f.get();
                    } catch (Exception e) {
                      throw new RuntimeException(e);
                    }
                  })
              .toList();
      assertEquals(
          List.of(201, 409),
          results.stream().map(r -> r.getResponse().getStatus()).sorted().toList());
      var ok =
          results.stream()
              .filter(r -> r.getResponse().getStatus() == 201)
              .findFirst()
              .orElseThrow();
      assertEquals(
          "21470000000000002",
          json.readTree(ok.getResponse().getContentAsString()).get("payout_minor").asText());
    }
  }
}
