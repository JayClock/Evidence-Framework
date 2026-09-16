package com.evidencepoc.backend.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.evidencepoc.backend.domain.description.SubscriptionDescription;
import com.evidencepoc.backend.domain.model.PaymentRequest;
import com.evidencepoc.backend.domain.model.PaymentRequest.Status;
import com.evidencepoc.backend.domain.model.Subscription;
import com.evidencepoc.backend.domain.role.PaymentProof;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class PaymentStatusTests {
  private static final Instant STARTED_AT = Instant.parse("2026-10-01T09:00:00Z");
  private static final Instant EXPIRED_AT = Instant.parse("2026-10-01T09:15:00Z");
  private static final Instant BEFORE_DEADLINE = Instant.parse("2026-10-01T09:14:59Z");

  @Test
  void derivesTheUniquePaymentRequestFromFrozenContractFacts() {
    Subscription subscription = subscription();

    assertThrows(PaymentRequestNotFoundException.class, subscription::paymentRequest);
    assertThrows(IllegalArgumentException.class, () -> subscription.startPayment(" "));
    assertThrows(PaymentRequestNotFoundException.class, subscription::paymentRequest);

    PaymentRequest request = subscription.startPayment("PAY-001");

    assertEquals("PAY-001", request.requestId());
    assertEquals("SUB-20261001-001", request.subscriptionId());
    assertEquals("READER-001", request.readerId());
    assertEquals("COL-BM", request.columnId());
    assertEquals(STARTED_AT, request.startedAt());
    assertEquals(EXPIRED_AT, request.expiredAt());
    assertEquals(9900, request.amountMinorUnits());
    assertEquals("CNY", request.currency());
    assertSame(request, subscription.startPayment("PAY-001"));
    assertThrows(IllegalStateException.class, () -> subscription.startPayment("PAY-002"));
    assertSame(request, subscription.paymentRequest());
  }

  @Test
  void remainsPendingBeforeAndAtTheDeadlineWithoutAMatchingProof() {
    Subscription subscription = subscription();
    PaymentRequest request = subscription.startPayment("PAY-001");

    assertEquals(Status.PENDING, request.status(subscription, List.of(), BEFORE_DEADLINE));
    assertEquals(Status.PENDING, request.status(subscription, List.of(), EXPIRED_AT));
    assertThrows(
        IllegalStateException.class,
        () -> request.status(subscription, List.of(), EXPIRED_AT.plusSeconds(1)));
  }

  @Test
  void acceptsExactlyOneMatchingSuccessfulProofAtBothClosedTimeBoundaries() {
    Subscription subscription = subscription();
    PaymentRequest request = subscription.startPayment("PAY-001");

    PaymentProof atStart = validProof(STARTED_AT, "MOBILE-RESULT-START");
    PaymentProof atDeadline = validProof(EXPIRED_AT, "MOBILE-RESULT-CUTOFF");

    assertTrue(request.isCompleted(subscription, List.of(atStart)));
    assertEquals(Status.COMPLETED, request.status(subscription, List.of(atStart), STARTED_AT));
    assertTrue(request.isCompleted(subscription, List.of(atDeadline)));
    assertEquals(Status.COMPLETED, request.status(subscription, List.of(atDeadline), EXPIRED_AT));
  }

  @Test
  void duplicateAndMismatchedProofsDoNotCompletePaymentOrMutateTheRequest() {
    Subscription subscription = subscription();
    PaymentRequest request = subscription.startPayment("PAY-001");
    TestProof valid = validProof(STARTED_AT.plusSeconds(120), "MOBILE-RESULT-001");

    assertFalse(
        request.isCompleted(
            subscription,
            List.of(valid, validProof(STARTED_AT.plusSeconds(121), "MOBILE-RESULT-002"))));
    assertNotCompleted(request, subscription, valid.withSubscriptionId("OTHER"));
    assertNotCompleted(request, subscription, valid.withReaderId("OTHER"));
    assertNotCompleted(request, subscription, valid.withColumnId("OTHER"));
    assertNotCompleted(request, subscription, valid.withPaymentRequestId("OTHER"));
    assertNotCompleted(request, subscription, valid.withAmountMinorUnits(9899));
    assertNotCompleted(request, subscription, valid.withCurrency("USD"));
    assertNotCompleted(request, subscription, valid.withSuccess(false));
    assertNotCompleted(request, subscription, valid.withConfirmedAt(STARTED_AT.minusSeconds(1)));
    assertNotCompleted(request, subscription, valid.withConfirmedAt(EXPIRED_AT.plusSeconds(1)));
    assertNotCompleted(request, subscription, valid.withRequestId(" "));
    assertNotCompleted(request, subscription, valid.withPaymentId(" "));
    assertFalse(request.isCompleted(otherSubscription(), List.of(valid)));

    assertEquals("PAY-001", request.requestId());
    assertEquals(STARTED_AT, request.startedAt());
    assertEquals(EXPIRED_AT, request.expiredAt());
    assertEquals(9900, request.amountMinorUnits());
    assertEquals("CNY", request.currency());
  }

  @Test
  void requiresBusinessTimeWhenChoosingBetweenPendingAndCompleted() {
    Subscription subscription = subscription();
    PaymentRequest request = subscription.startPayment("PAY-001");

    assertThrows(
        IllegalArgumentException.class,
        () -> request.status(subscription, List.of(validProof(STARTED_AT, "RESULT")), null));
  }

  private static void assertNotCompleted(
      PaymentRequest request, Subscription agreement, PaymentProof proof) {
    assertFalse(request.isCompleted(agreement, List.of(proof)));
    assertEquals(Status.PENDING, request.status(agreement, List.of(proof), BEFORE_DEADLINE));
  }

  private static Subscription subscription() {
    return new Subscription("SUB-20261001-001", description("READER-001"));
  }

  private static Subscription otherSubscription() {
    return new Subscription("SUB-OTHER", description("READER-001"));
  }

  private static SubscriptionDescription description(String readerId) {
    return new SubscriptionDescription(
        readerId, "COL-BM", "ED-1", 9900, "CNY", STARTED_AT, 900, 60, 604800, 86400);
  }

  private static TestProof validProof(Instant confirmedAt, String paymentId) {
    return new TestProof(
        "MOBILE-REQ-001",
        "SUB-20261001-001",
        "READER-001",
        "COL-BM",
        confirmedAt,
        "PAY-001",
        9900,
        "CNY",
        paymentId,
        true);
  }

  private record TestProof(
      String requestId,
      String subscriptionId,
      String readerId,
      String columnId,
      Instant confirmedAt,
      String paymentRequestId,
      long amountMinorUnits,
      String currency,
      String paymentId,
      boolean success)
      implements PaymentProof {
    TestProof withRequestId(String value) {
      return new TestProof(
          value,
          subscriptionId,
          readerId,
          columnId,
          confirmedAt,
          paymentRequestId,
          amountMinorUnits,
          currency,
          paymentId,
          success);
    }

    TestProof withSubscriptionId(String value) {
      return new TestProof(
          requestId,
          value,
          readerId,
          columnId,
          confirmedAt,
          paymentRequestId,
          amountMinorUnits,
          currency,
          paymentId,
          success);
    }

    TestProof withReaderId(String value) {
      return new TestProof(
          requestId,
          subscriptionId,
          value,
          columnId,
          confirmedAt,
          paymentRequestId,
          amountMinorUnits,
          currency,
          paymentId,
          success);
    }

    TestProof withColumnId(String value) {
      return new TestProof(
          requestId,
          subscriptionId,
          readerId,
          value,
          confirmedAt,
          paymentRequestId,
          amountMinorUnits,
          currency,
          paymentId,
          success);
    }

    TestProof withConfirmedAt(Instant value) {
      return new TestProof(
          requestId,
          subscriptionId,
          readerId,
          columnId,
          value,
          paymentRequestId,
          amountMinorUnits,
          currency,
          paymentId,
          success);
    }

    TestProof withPaymentRequestId(String value) {
      return new TestProof(
          requestId,
          subscriptionId,
          readerId,
          columnId,
          confirmedAt,
          value,
          amountMinorUnits,
          currency,
          paymentId,
          success);
    }

    TestProof withAmountMinorUnits(long value) {
      return new TestProof(
          requestId,
          subscriptionId,
          readerId,
          columnId,
          confirmedAt,
          paymentRequestId,
          value,
          currency,
          paymentId,
          success);
    }

    TestProof withCurrency(String value) {
      return new TestProof(
          requestId,
          subscriptionId,
          readerId,
          columnId,
          confirmedAt,
          paymentRequestId,
          amountMinorUnits,
          value,
          paymentId,
          success);
    }

    TestProof withPaymentId(String value) {
      return new TestProof(
          requestId,
          subscriptionId,
          readerId,
          columnId,
          confirmedAt,
          paymentRequestId,
          amountMinorUnits,
          currency,
          value,
          success);
    }

    TestProof withSuccess(boolean value) {
      return new TestProof(
          requestId,
          subscriptionId,
          readerId,
          columnId,
          confirmedAt,
          paymentRequestId,
          amountMinorUnits,
          currency,
          paymentId,
          value);
    }
  }
}
