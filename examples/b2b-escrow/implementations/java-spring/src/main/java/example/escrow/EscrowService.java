package example.escrow;

import static example.escrow.BusinessError.require;
import static example.escrow.Money.*;

import java.math.BigInteger;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
public class EscrowService {
  public record Definition(String name, List<String> roles, Map<String, List<String>> actions) {}

  public static final Map<String, Definition> DEFINITIONS =
      Map.of(
          "procurement",
              new Definition(
                  "agreement",
                  List.of("buyer", "seller"),
                  Map.of(
                      "order",
                      List.of("buyer", "seller"),
                      "commitment",
                      List.of("seller", "buyer"))),
          "escrow",
              new Definition(
                  "escrow",
                  List.of("buyer", "escrow"),
                  Map.of(
                      "deposit-lock",
                      List.of("buyer", "escrow"),
                      "custody-statement",
                      List.of("escrow", "buyer"))),
          "fulfillment",
              new Definition(
                  "fulfillment",
                  List.of("buyer", "seller"),
                  Map.of(
                      "delivery",
                      List.of("buyer", "seller"),
                      "acceptance",
                      List.of("seller", "buyer"),
                      "first-milestone",
                      List.of("buyer", "seller"),
                      "final-milestone",
                      List.of("buyer", "seller"),
                      "milestone-acceptance",
                      List.of("seller", "buyer"))),
          "settlement",
              new Definition(
                  "settlement",
                  List.of("seller", "escrow"),
                  Map.of(
                      "release",
                      List.of("seller", "escrow"),
                      "settlement-receipt",
                      List.of("escrow", "seller"),
                      "milestone-release",
                      List.of("seller", "escrow"),
                      "milestone-statement",
                      List.of("escrow", "seller"))));
  private static final Set<String>
      DELIVERIES = Set.of("delivery", "first-milestone", "final-milestone"),
      ACCEPTANCES = Set.of("acceptance", "milestone-acceptance"),
      RELEASES = Set.of("release", "milestone-release"),
      ACKS = Set.of("commitment", "custody-statement", "settlement-receipt", "milestone-statement");

  // The standalone service owns its business vocabulary without a projector dependency.
  public static String collectionOf(String name) {
    return name.equals("delivery") ? "deliveries" : name + "s";
  }

  public record Fact(
      String id,
      String kind,
      String contractId,
      String orderId,
      String requestId,
      Map<String, Object> data,
      String href) {
    public Fact {
      data = Map.copyOf(data);
    }
  }

  // Synchronized methods form an in-memory transaction (check + commit).
  // Persistence requires database transactions and unique constraints instead.
  private final Map<String, Fact> facts = new HashMap<>();

  public synchronized Fact get(String id, String kind) {
    Fact f = facts.get(id);
    if (f == null || kind != null && !kind.equals(f.kind()))
      throw new BusinessError(404, "NOT_FOUND", "Evidence does not exist");
    return f;
  }

  private Fact find(String contractId, String kind) {
    return facts.values().stream()
        .filter(f -> f.contractId().equals(contractId) && f.kind().equals(kind))
        .findFirst()
        .orElse(null);
  }

  public synchronized List<Fact> list(String kind, String contractId) {
    return facts.values().stream()
        .filter(
            f -> f.kind().equals(kind) && (contractId == null || f.contractId().equals(contractId)))
        .toList();
  }

  public synchronized Fact requestFact(
      String lane, String contractId, String action, String requestId) {
    get(contractId, "contract." + DEFINITIONS.get(lane).name());
    Fact f = get(requestId, "request." + action);
    if (!f.contractId().equals(contractId))
      throw new BusinessError(404, "NOT_FOUND", "Request belongs to another contract");
    return f;
  }

  public synchronized Fact confirmation(String requestId) {
    return facts.values().stream()
        .filter(f -> requestId.equals(f.requestId()))
        .findFirst()
        .orElseThrow(() -> new BusinessError(404, "NOT_FOUND", "Confirmation has not been formed"));
  }

  private Fact previous(String contractId, String kind) {
    Fact f = find(contractId, kind);
    require(f != null, "Missing prerequisite " + kind);
    return f;
  }

  private boolean released(String orderId) {
    return facts.values().stream()
        .anyMatch(
            f ->
                f.orderId().equals(orderId)
                    && RELEASES.stream().anyMatch(a -> f.kind().equals("confirmation." + a)));
  }

  private Fact commit(Fact f) {
    if (facts.containsKey(f.id()))
      throw new BusinessError(409, "CONFLICT", "Evidence ID already exists");
    if (f.requestId() != null
        && facts.values().stream().anyMatch(old -> f.requestId().equals(old.requestId())))
      throw new BusinessError(409, "CONFLICT", "Request already confirmed");
    facts.put(f.id(), f);
    return f;
  }

  private void chronology(Fact f, Instant now) {
    String key =
        List.of("confirmed_at", "started_at", "signed_at").stream()
            .filter(f.data()::containsKey)
            .findFirst()
            .orElseThrow();
    require(
        !now.isBefore(time((String) f.data().get(key))), "Evidence cannot precede prerequisite");
  }

  private Fact order(Fact contract) {
    return get((String) contract.data().get("order_confirmation_id"), "confirmation.order");
  }

  private static String segment(String id) {
    return URLEncoder.encode(id, StandardCharsets.UTF_8).replace("+", "%20");
  }

  public synchronized Fact sign(String lane, Map<String, Object> input, Instant now) {
    Map<String, String> fields = new HashMap<>(Map.of("id", "id"));
    if (lane.equals("procurement")) {
      for (String k :
          List.of("quantity", "tier_threshold", "tier1_unit_price_minor", "tier2_unit_price_minor"))
        fields.put(k, "positive");
      for (String k : List.of("tax_bps", "retention_bps", "daily_penalty_bps"))
        fields.put(k, "bps");
      fields.put("delivery_deadline", "time");
    } else {
      fields.put("order_confirmation_id", "id");
      if (!lane.equals("escrow")) fields.put("deposit_confirmation_id", "id");
      if (lane.equals("settlement")) fields.put("acceptance_confirmation_id", "id");
    }
    Map<String, Object> d = parse(input, fields);
    String id = (String) d.get("id"), orderId = id;
    if (lane.equals("procurement")) price(d);
    else {
      Fact order = get((String) d.get("order_confirmation_id"), "confirmation.order");
      orderId = order.id();
      chronology(order, now);
      chronology(previous(order.contractId(), "confirmation.commitment"), now);
      if (!lane.equals("escrow")) {
        Fact deposit = get((String) d.get("deposit_confirmation_id"), "confirmation.deposit-lock");
        require(deposit.orderId().equals(order.id()), "Deposit belongs to another order");
        chronology(deposit, now);
        chronology(previous(deposit.contractId(), "confirmation.custody-statement"), now);
        require(
            deposit
                .data()
                .get("locked_amount_minor")
                .equals(order.data().get("gross_amount_minor")),
            "Deposit is not fully funded");
      }
      if (lane.equals("settlement")) {
        Fact a = get((String) d.get("acceptance_confirmation_id"), null);
        require(
            ACCEPTANCES.stream().anyMatch(k -> a.kind().equals("confirmation." + k))
                && a.orderId().equals(order.id())
                && Boolean.TRUE.equals(a.data().get("accepted")),
            "Invalid acceptance evidence");
        chronology(a, now);
        require(
            get(a.contractId(), "contract.fulfillment")
                .data()
                .get("deposit_confirmation_id")
                .equals(d.get("deposit_confirmation_id")),
            "Acceptance uses another deposit");
      }
    }
    d.put("signed_at", stamp(now));
    return commit(
        new Fact(
            id,
            "contract." + DEFINITIONS.get(lane).name(),
            id,
            orderId,
            null,
            d,
            "/" + collectionOf(DEFINITIONS.get(lane).name()) + "/" + segment(id)));
  }

  public synchronized Fact request(
      String lane, String action, String contractId, Map<String, Object> input, Instant now) {
    Map<String, Object> d = parse(input, Map.of("id", "id"));
    Fact c = get(contractId, "contract." + DEFINITIONS.get(lane).name());
    chronology(c, now);
    require(find(contractId, "request." + action) == null, "Obligation already requested");
    Map<String, String> prerequisites =
        Map.of(
            "commitment",
            "order",
            "custody-statement",
            "deposit-lock",
            "acceptance",
            "delivery",
            "final-milestone",
            "first-milestone",
            "milestone-acceptance",
            "final-milestone",
            "settlement-receipt",
            "release",
            "milestone-statement",
            "milestone-release");
    if (prerequisites.containsKey(action))
      chronology(previous(contractId, "confirmation." + prerequisites.get(action)), now);
    if (RELEASES.contains(action)) {
      Fact a = get((String) c.data().get("acceptance_confirmation_id"), null);
      require(
          a.kind()
              .equals(
                  "confirmation."
                      + (action.equals("release") ? "acceptance" : "milestone-acceptance")),
          "Release does not match acceptance");
      require(!released(c.orderId()), "Order already released");
    }
    if (DELIVERIES.contains(action))
      require(
          find(
                  contractId,
                  "request." + (action.equals("delivery") ? "first-milestone" : "delivery"))
              == null,
          "Cannot mix delivery modes");
    String id = (String) d.get("id");
    d.put("started_at", stamp(now));
    d.put("expired_at", stamp(now.plus(48, ChronoUnit.HOURS)));
    return commit(
        new Fact(
            id,
            "request." + action,
            contractId,
            c.orderId(),
            null,
            d,
            c.href() + "/" + collectionOf(action) + "/" + segment(id)));
  }

  public synchronized Fact confirm(
      String lane,
      String action,
      String contractId,
      String requestId,
      Map<String, Object> input,
      Instant now) {
    Map<String, String> fields = new HashMap<>(Map.of("id", "id"));
    if (DELIVERIES.contains(action)) fields.put("delivered_quantity", "positive");
    if (ACCEPTANCES.contains(action)) fields.put("accepted", "true");
    if (ACKS.contains(action)) fields.put("acknowledged", "true");
    Map<String, Object> d = parse(input, fields);
    Fact c = get(contractId, "contract." + DEFINITIONS.get(lane).name()),
        r = get(requestId, "request." + action);
    require(r.contractId().equals(contractId), "Request belongs to another contract");
    chronology(r, now);
    require(!now.isAfter(time((String) r.data().get("expired_at"))), "Request expired");
    if (action.equals("order")) {
      d.putAll(price(c.data()));
      for (String k :
          List.of("quantity", "retention_bps", "daily_penalty_bps", "delivery_deadline"))
        d.put(k, c.data().get(k));
    } else if (action.equals("deposit-lock"))
      d.put("locked_amount_minor", order(c).data().get("gross_amount_minor"));
    else if (DELIVERIES.contains(action)) {
      BigInteger q = number(d, "delivered_quantity"), ordered = number(order(c).data(), "quantity");
      if (action.equals("delivery")) require(q.equals(ordered), "Incomplete delivery");
      else if (action.equals("first-milestone"))
        require(q.compareTo(ordered) < 0, "First milestone must leave remainder");
      else
        require(
            q.add(
                    number(
                        previous(contractId, "confirmation.first-milestone").data(),
                        "delivered_quantity"))
                .equals(ordered),
            "Invalid milestone total");
    } else if (ACCEPTANCES.contains(action)) {
      Fact o = order(c);
      BigInteger q =
          number(
              previous(
                      contractId,
                      "confirmation."
                          + (action.equals("acceptance") ? "delivery" : "first-milestone"))
                  .data(),
              "delivered_quantity");
      if (action.equals("milestone-acceptance"))
        q =
            q.add(
                number(
                    previous(contractId, "confirmation.final-milestone").data(),
                    "delivered_quantity"));
      require(q.equals(o.data().get("quantity")), "Incomplete delivery");
      d.put("accepted_quantity", q);
      d.put("late_days", lateDays(now, (String) o.data().get("delivery_deadline")));
    } else if (RELEASES.contains(action)) {
      if (released(c.orderId()))
        throw new BusinessError(409, "ALREADY_CONFIRMED", "Order already released");
      Fact o = order(c), a = get((String) c.data().get("acceptance_confirmation_id"), null);
      d.putAll(
          settle(
              number(o.data(), "gross_amount_minor"),
              number(o.data(), "retention_bps"),
              number(o.data(), "daily_penalty_bps"),
              number(a.data(), "late_days")));
    }
    String id = (String) d.get("id");
    d.put("confirmed_at", stamp(now));
    return commit(
        new Fact(
            id,
            "confirmation." + action,
            contractId,
            action.equals("order") ? id : c.orderId(),
            requestId,
            d,
            r.href() + "/confirmation"));
  }
}
