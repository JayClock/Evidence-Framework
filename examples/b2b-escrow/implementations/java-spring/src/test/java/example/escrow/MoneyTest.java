package example.escrow;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigInteger;
import java.util.*;
import org.junit.jupiter.api.Test;

class MoneyTest {
  @Test
  void exactBoundaryAndRounding() {
    for (Object value :
        List.of(true, 1.5, new BigInteger("9007199254740992"), "9223372036854775808", "01", "-0"))
      assertThrows(BusinessError.class, () -> Money.integer(value));
    assertEquals(BigInteger.valueOf(Long.MAX_VALUE), Money.integer("9223372036854775807"));
    assertEquals(
        BigInteger.valueOf(67744),
        Money.round(BigInteger.valueOf(1354870), BigInteger.valueOf(500)));
    assertEquals(
        new BigInteger("21244000000000002"),
        Money.settle(
                new BigInteger("22600000000000002"),
                BigInteger.valueOf(500),
                BigInteger.valueOf(100),
                BigInteger.ONE)
            .get("payout_minor"));
    var cap =
        Money.settle(
            BigInteger.valueOf(1356225),
            BigInteger.valueOf(500),
            BigInteger.valueOf(100),
            BigInteger.valueOf(1000000));
    assertEquals(BigInteger.ZERO, cap.get("payout_minor"));
    assertEquals(
        cap.get("gross_amount_minor"),
        ((BigInteger) cap.get("retention_minor")).add((BigInteger) cap.get("late_penalty_minor")));
    assertEquals("9007199254740993", Money.wire(new BigInteger("9007199254740993")));
    assertThrows(
        BusinessError.class,
        () -> Money.round(BigInteger.valueOf(Long.MAX_VALUE), BigInteger.valueOf(20000)));
  }

  @Test
  void utcAndDeadlineBoundaries() {
    String deadline = "2026-06-01T00:00:00Z";
    assertEquals(BigInteger.ZERO, Money.lateDays(Money.time(deadline), deadline));
    assertEquals(BigInteger.ONE, Money.lateDays(Money.time("2026-06-01T00:00:01Z"), deadline));
    assertEquals(
        BigInteger.valueOf(15), Money.lateDays(Money.time("2026-06-16T00:00:00Z"), deadline));
    for (String bad :
        List.of("2026-02-30T00:00:00Z", "2026-06-01T00:00:00+00:00", "2026-06-01T00:00:00.001Z"))
      assertThrows(BusinessError.class, () -> Money.time(bad));
  }
}
