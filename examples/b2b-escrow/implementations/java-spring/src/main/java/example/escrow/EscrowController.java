package example.escrow;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
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

  private static final Map<String, String> LANES =
      EscrowService.DEFINITIONS.entrySet().stream()
          .collect(
              Collectors.toUnmodifiableMap(
                  e -> EscrowService.collectionOf(e.getValue().name()), Map.Entry::getKey));

  private record Route(String lane, EscrowService.Definition definition, String action) {}

  private Route route(String collection, String actionCollection) {
    String lane = LANES.get(collection);
    if (lane == null) throw new BusinessError(404, "NOT_FOUND", "Unknown route");
    var d = EscrowService.DEFINITIONS.get(lane);
    String action = null;
    if (actionCollection != null) {
      action =
          d.actions().keySet().stream()
              .filter(a -> EscrowService.collectionOf(a).equals(actionCollection))
              .findFirst()
              .orElseThrow(() -> new BusinessError(404, "NOT_FOUND", "Unknown route"));
      if (env.getProperty("escrow.mode", "v2").equals("v1") && action.contains("milestone"))
        throw new BusinessError(404, "NOT_FOUND", "Unknown route");
    }
    return new Route(lane, d, action);
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

  private Object representation(EscrowService.Fact fact) {
    Map<String, Object> d = new LinkedHashMap<>(fact.data());
    if (env.getProperty("escrow.fault", "none").equals("extra-field")) d.put("unmodeled", true);
    if (env.getProperty("escrow.fault", "none").equals("precision"))
      // Test-only bug: lose exact integer precision at the serialization boundary.
      d.replaceAll(
          (key, value) ->
              value instanceof BigInteger n
                  ? new BigDecimal(n.doubleValue()).toBigInteger()
                  : value);
    d.put("_links", Map.of("self", Map.of("href", fact.href())));
    return Money.wire(d);
  }

  private ResponseEntity<Object> response(EscrowService.Fact fact, int status) {
    var builder = ResponseEntity.status(status).header("Content-Type", "application/hal+json");
    if (status == 201) builder.header("Location", fact.href());
    return builder.body(representation(fact));
  }

  private ResponseEntity<Object> collection(
      String href, String name, List<EscrowService.Fact> facts) {
    return ResponseEntity.ok()
        .header("Content-Type", "application/hal+json")
        .body(
            Map.of(
                "_links", Map.of("self", Map.of("href", href)),
                "_embedded", Map.of(name, facts.stream().map(this::representation).toList()),
                "total", facts.size()));
  }

  @GetMapping("/{collection}")
  public ResponseEntity<Object> listContracts(@PathVariable String collection) {
    var r = route(collection, null);
    authorize(r.lane(), r.definition().roles());
    return collection(
        "/" + collection, collection, service.list("contract." + r.definition().name(), null));
  }

  @PostMapping("/{collection}")
  public ResponseEntity<Object> sign(@PathVariable String collection, HttpServletRequest request)
      throws IOException {
    var r = route(collection, null);
    Instant now = authorize(r.lane(), r.definition().roles());
    return response(service.sign(r.lane(), body(request), now), 201);
  }

  @GetMapping("/{collection}/{contractId}")
  public ResponseEntity<Object> get(
      @PathVariable String collection, @PathVariable String contractId) {
    var r = route(collection, null);
    authorize(r.lane(), r.definition().roles());
    return response(service.get(contractId, "contract." + r.definition().name()), 200);
  }

  @GetMapping("/{collection}/{contractId}/{actionCollection}")
  public ResponseEntity<Object> listRequests(
      @PathVariable String collection,
      @PathVariable String contractId,
      @PathVariable String actionCollection) {
    var r = route(collection, actionCollection);
    authorize(r.lane(), List.of(r.definition().actions().get(r.action()).getFirst()));
    var contract = service.get(contractId, "contract." + r.definition().name());
    return collection(
        contract.href() + "/" + actionCollection,
        actionCollection,
        service.list("request." + r.action(), contractId));
  }

  @GetMapping("/{collection}/{contractId}/{actionCollection}/{requestId}")
  public ResponseEntity<Object> getRequest(
      @PathVariable String collection,
      @PathVariable String contractId,
      @PathVariable String actionCollection,
      @PathVariable String requestId) {
    var r = route(collection, actionCollection);
    authorize(r.lane(), List.of(r.definition().actions().get(r.action()).getFirst()));
    return response(service.requestFact(r.lane(), contractId, r.action(), requestId), 200);
  }

  @GetMapping("/{collection}/{contractId}/{actionCollection}/{requestId}/confirmation")
  public ResponseEntity<Object> getConfirmation(
      @PathVariable String collection,
      @PathVariable String contractId,
      @PathVariable String actionCollection,
      @PathVariable String requestId) {
    var r = route(collection, actionCollection);
    authorize(r.lane(), List.of(r.definition().actions().get(r.action()).get(1)));
    service.requestFact(r.lane(), contractId, r.action(), requestId);
    return response(service.confirmation(requestId), 200);
  }

  @PostMapping("/{collection}/{contractId}/{actionCollection}")
  public ResponseEntity<Object> request(
      @PathVariable String collection,
      @PathVariable String contractId,
      @PathVariable String actionCollection,
      HttpServletRequest request)
      throws IOException {
    var r = route(collection, actionCollection);
    Instant now = authorize(r.lane(), List.of(r.definition().actions().get(r.action()).getFirst()));
    return response(service.request(r.lane(), r.action(), contractId, body(request), now), 201);
  }

  @PostMapping("/{collection}/{contractId}/{actionCollection}/{requestId}/confirmation")
  public ResponseEntity<Object> confirm(
      @PathVariable String collection,
      @PathVariable String contractId,
      @PathVariable String actionCollection,
      @PathVariable String requestId,
      HttpServletRequest request)
      throws IOException {
    var r = route(collection, actionCollection);
    Instant now = authorize(r.lane(), List.of(r.definition().actions().get(r.action()).get(1)));
    Map<String, Object> input = body(request);
    if (env.getProperty("escrow.fault", "none").equals("accept-derived")
        && Set.of("release", "milestone-release").contains(r.action())
        && input.containsKey("payout_minor"))
      // Test-only bug: trust caller data, without committing a confirmation.
      return ResponseEntity.status(201).body(input);
    return response(service.confirm(r.lane(), r.action(), contractId, requestId, input, now), 201);
  }

  @ExceptionHandler(BusinessError.class)
  public ResponseEntity<Object> error(BusinessError e) {
    return ResponseEntity.status(e.status).body(Map.of("error", e.code, "detail", e.getMessage()));
  }
}
