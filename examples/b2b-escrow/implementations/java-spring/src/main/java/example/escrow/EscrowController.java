package example.escrow;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Instant;
import java.util.*;
import org.springframework.core.env.Environment;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class EscrowController {
  private final EscrowService service;
  private final ObjectMapper json;
  private final Environment env;

  public EscrowController(EscrowService service, ObjectMapper json, Environment env) {
    this.service = service;
    this.json = json;
    this.env = env;
    if (!Application.FAULTS.contains(env.getProperty("escrow.fault", "none")))
      throw new IllegalArgumentException("Unknown fault");
  }

  private EscrowService.Definition definition(String lane, String name, String action) {
    var d = EscrowService.DEFINITIONS.get(lane);
    if (d == null
        || !d.name().equals(name)
        || action != null
            && (!d.actions().containsKey(action)
                || env.getProperty("escrow.mode", "v2").equals("v1")
                    && action.contains("milestone")))
      throw new BusinessError(404, "NOT_FOUND", "Unknown route");
    return d;
  }

  private Instant authorize(String lane, List<String> roles) {
    var c = RequestContextFilter.current();
    if (roles.stream().noneMatch(r -> c.role().equals("role." + lane + "-" + r)))
      throw new BusinessError(403, "FORBIDDEN", "Role cannot perform operation");
    return c.now();
  }

  private Map<String, Object> body(HttpServletRequest request) throws IOException {
    byte[] bytes = request.getInputStream().readNBytes(65537);
    if (bytes.length > 65536) throw new BusinessError(413, "INVALID_INPUT", "Body too large");
    try {
      Map<String, Object> d = json.readValue(bytes, new TypeReference<>() {});
      if (d == null) throw BusinessError.invalid("Expected JSON object");
      return d;
    } catch (com.fasterxml.jackson.core.JacksonException e) {
      throw BusinessError.invalid("Invalid JSON object");
    }
  }

  private ResponseEntity<Object> response(EscrowService.Fact fact, int status) {
    Map<String, Object> d = new LinkedHashMap<>(fact.data());
    if (env.getProperty("escrow.fault", "none").equals("extra-field"))
      d.put("unmodeled", true);
    if (env.getProperty("escrow.fault", "none").equals("precision"))
      // Test-only bug: lose exact integer precision at the serialization boundary.
      d.replaceAll((key, value) -> value instanceof BigInteger n
          ? new BigDecimal(n.doubleValue()).toBigInteger() : value);
    d.put("_links", Map.of("self", Map.of("href", fact.href())));
    var builder = ResponseEntity.status(status).header("Content-Type", "application/hal+json");
    if (status == 201) builder.header("Location", fact.href());
    return builder.body(Money.wire(d));
  }

  @PostMapping("/{lane}/{name}")
  public ResponseEntity<Object> sign(
      @PathVariable String lane, @PathVariable String name, HttpServletRequest request)
      throws IOException {
    var d = definition(lane, name, null);
    Instant now = authorize(lane, d.roles());
    return response(service.sign(lane, body(request), now), 201);
  }

  @GetMapping("/{lane}/{name}/{contractId}")
  public ResponseEntity<Object> get(
      @PathVariable String lane, @PathVariable String name, @PathVariable String contractId) {
    var d = definition(lane, name, null);
    authorize(lane, d.roles());
    return response(service.get(contractId, "contract." + d.name()), 200);
  }

  @GetMapping("/{lane}/{name}/{contractId}/{action}")
  public ResponseEntity<Object> ledger(
      @PathVariable String lane,
      @PathVariable String name,
      @PathVariable String contractId,
      @PathVariable String action) {
    var d = definition(lane, name, action);
    authorize(lane, List.of(d.actions().get(action).getFirst()));
    return response(service.ledger(lane, contractId, action), 200);
  }

  @PostMapping("/{lane}/{name}/{contractId}/{action}/request")
  public ResponseEntity<Object> request(
      @PathVariable String lane,
      @PathVariable String name,
      @PathVariable String contractId,
      @PathVariable String action,
      HttpServletRequest request)
      throws IOException {
    var d = definition(lane, name, action);
    Instant now = authorize(lane, List.of(d.actions().get(action).getFirst()));
    return response(service.request(lane, action, contractId, body(request), now), 201);
  }

  @PostMapping("/{lane}/{name}/{contractId}/{action}/request/{requestId}/confirmation")
  public ResponseEntity<Object> confirm(
      @PathVariable String lane,
      @PathVariable String name,
      @PathVariable String contractId,
      @PathVariable String action,
      @PathVariable String requestId,
      HttpServletRequest request)
      throws IOException {
    var d = definition(lane, name, action);
    Instant now = authorize(lane, List.of(d.actions().get(action).get(1)));
    Map<String, Object> input = body(request);
    if (env.getProperty("escrow.fault", "none").equals("accept-derived")
        && Set.of("release", "milestone-release").contains(action)
        && input.containsKey("payout_minor"))
      // Test-only bug: trust caller data, without committing a confirmation.
      return ResponseEntity.status(201).body(input);
    return response(service.confirm(lane, action, contractId, requestId, input, now), 201);
  }

  @ExceptionHandler(BusinessError.class)
  public ResponseEntity<Object> error(BusinessError e) {
    return ResponseEntity.status(e.status).body(Map.of("error", e.code, "detail", e.getMessage()));
  }
}
