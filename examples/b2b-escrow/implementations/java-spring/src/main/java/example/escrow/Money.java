package example.escrow;

import static example.escrow.BusinessError.invalid;

import java.math.BigInteger;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.*;

public final class Money {
  public static final BigInteger SAFE = BigInteger.valueOf(9007199254740991L);
  private static final BigInteger BPS = BigInteger.valueOf(10000), HALF = BigInteger.valueOf(5000);
  private static final DateTimeFormatter UTC =
      DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss'Z'")
          .withResolverStyle(ResolverStyle.STRICT);

  public static Instant time(String text) {
    if (!text.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z"))
      throw invalid("Expected whole-second UTC timestamp");
    try {
      return LocalDateTime.parse(text, UTC).toInstant(ZoneOffset.UTC);
    } catch (DateTimeException e) {
      throw invalid("Invalid UTC timestamp");
    }
  }

  public static String stamp(Instant t) {
    return UTC.format(t.atOffset(ZoneOffset.UTC));
  }

  public static BigInteger integer(Object value) {
    BigInteger n;
    if (value instanceof String s && s.matches("0|-?[1-9][0-9]*")) n = new BigInteger(s);
    else if (value instanceof BigInteger b) {
      n = b;
      if (n.abs().compareTo(SAFE) > 0)
        throw invalid("Unsafe JSON number; use exact decimal string");
    } else if (value instanceof Long || value instanceof Integer) {
      n = BigInteger.valueOf(((Number) value).longValue());
      if (n.abs().compareTo(SAFE) > 0) throw invalid("Unsafe JSON number");
    } else throw invalid("Expected integer or exact decimal string");
    return checked(n);
  }

  public static BigInteger checked(BigInteger n) {
    if (n.compareTo(BigInteger.valueOf(Long.MIN_VALUE)) < 0
        || n.compareTo(BigInteger.valueOf(Long.MAX_VALUE)) > 0)
      throw invalid("Result outside signed int64");
    return n;
  }

  public static Map<String, Object> parse(Map<String, Object> body, Map<String, String> fields) {
    if (body == null || !body.keySet().equals(fields.keySet()))
      throw invalid("Missing or unknown fields");
    Map<String, Object> out = new HashMap<>();
    fields.forEach(
        (key, kind) -> {
          Object v = body.get(key);
          switch (kind) {
            case "id" -> {
              if (!(v instanceof String s) || s.isEmpty() || s.codePointCount(0, s.length()) > 200)
                throw invalid("Invalid ID");
              out.put(key, v);
            }
            case "time" -> {
              if (!(v instanceof String s)) throw invalid("Invalid time");
              time(s);
              out.put(key, s);
            }
            case "true" -> {
              if (!Boolean.TRUE.equals(v)) throw invalid("Expected true");
              out.put(key, true);
            }
            default -> {
              BigInteger n = integer(v);
              if (kind.equals("positive") && n.signum() <= 0
                  || kind.equals("bps") && (n.signum() < 0 || n.compareTo(BPS) > 0))
                throw invalid("Integer out of range");
              out.put(key, n);
            }
          }
        });
    return out;
  }

  public static BigInteger number(Map<String, Object> d, String k) {
    return (BigInteger) d.get(k);
  }

  public static BigInteger round(BigInteger a, BigInteger b) {
    return checked(a.multiply(b).add(HALF).divide(BPS));
  }

  public static Map<String, Object> price(Map<String, Object> terms) {
    BigInteger quantity = number(terms, "quantity");
    BigInteger unit =
        number(
            terms,
            quantity.compareTo(number(terms, "tier_threshold")) >= 0
                ? "tier2_unit_price_minor"
                : "tier1_unit_price_minor");
    BigInteger subtotal = checked(quantity.multiply(unit));
    return Map.of(
        "subtotal_minor",
        subtotal,
        "gross_amount_minor",
        round(subtotal, BPS.add(number(terms, "tax_bps"))));
  }

  public static Map<String, Object> settle(
      BigInteger gross, BigInteger retentionBps, BigInteger dailyBps, BigInteger days) {
    BigInteger retention = round(gross, retentionBps);
    BigInteger penalty =
        gross
            .multiply(days)
            .multiply(dailyBps)
            .add(HALF)
            .divide(BPS)
            .min(gross.subtract(retention));
    return Map.of(
        "gross_amount_minor",
        gross,
        "retention_minor",
        retention,
        "late_penalty_minor",
        penalty,
        "payout_minor",
        gross.subtract(retention).subtract(penalty));
  }

  public static BigInteger lateDays(Instant now, String deadline) {
    long delta = Math.max(0, now.getEpochSecond() - time(deadline).getEpochSecond());
    return BigInteger.valueOf((delta + 86399) / 86400);
  }

  public static Object wire(Object v) {
    if (v instanceof BigInteger n)
      return n.abs().compareTo(SAFE) > 0 ? n.toString() : n.longValueExact();
    if (v instanceof Map<?, ?> m) {
      Map<String, Object> out = new LinkedHashMap<>();
      m.forEach((k, item) -> out.put(k.toString(), wire(item)));
      return out;
    }
    return v;
  }
}
