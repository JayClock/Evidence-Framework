package com.evidencepoc.backend.domain.model;

import com.evidencepoc.backend.domain.role.PaymentProof;
import java.time.Instant;

public final class PaymentRequest {
  public enum Status {
    PENDING,
    COMPLETED
  }

  private final String requestId;
  private final String subscriptionId;
  private final String readerId;
  private final String columnId;
  private final Instant startedAt;
  private final Instant expiredAt;
  private final long amountMinorUnits;
  private final String currency;

  private PaymentRequest(
      String requestId,
      String subscriptionId,
      String readerId,
      String columnId,
      Instant startedAt,
      Instant expiredAt,
      long amountMinorUnits,
      String currency) {
    this.requestId = requireText(requestId, "requestId");
    this.subscriptionId = requireText(subscriptionId, "subscriptionId");
    this.readerId = requireText(readerId, "readerId");
    this.columnId = requireText(columnId, "columnId");
    this.startedAt = startedAt;
    this.expiredAt = expiredAt;
    this.amountMinorUnits = amountMinorUnits;
    this.currency = requireText(currency, "currency");
  }

  static PaymentRequest from(String requestId, Subscription subscription) {
    var description = subscription.getDescription();
    return new PaymentRequest(
        requestId,
        subscription.getIdentity(),
        description.readerId(),
        description.columnId(),
        description.signedAt(),
        description.signedAt().plusSeconds(description.paymentSeconds()),
        description.amountMinorUnits(),
        description.currency());
  }

  public String requestId() {
    return requestId;
  }

  public String subscriptionId() {
    return subscriptionId;
  }

  public String readerId() {
    return readerId;
  }

  public String columnId() {
    return columnId;
  }

  public Instant startedAt() {
    return startedAt;
  }

  public Instant expiredAt() {
    return expiredAt;
  }

  public long amountMinorUnits() {
    return amountMinorUnits;
  }

  public String currency() {
    return currency;
  }

  public boolean isCompleted(
      Subscription agreement, Iterable<? extends PaymentProof> availableProofs) {
    if (!matches(agreement)) {
      return false;
    }

    int matchingProofs = 0;
    for (PaymentProof proof : availableProofs) {
      if (matches(proof) && ++matchingProofs > 1) {
        return false;
      }
    }
    return matchingProofs == 1;
  }

  public Status status(
      Subscription agreement, Iterable<? extends PaymentProof> availableProofs, Instant asOf) {
    if (asOf == null) {
      throw new IllegalArgumentException("asOf is required");
    }
    if (isCompleted(agreement, availableProofs)) {
      return Status.COMPLETED;
    }
    if (asOf.isAfter(expiredAt)) {
      throw new IllegalStateException("Payment status after the deadline is outside this slice");
    }
    return Status.PENDING;
  }

  private boolean matches(Subscription agreement) {
    var description = agreement.getDescription();
    return subscriptionId.equals(agreement.getIdentity())
        && readerId.equals(description.readerId())
        && columnId.equals(description.columnId())
        && amountMinorUnits == description.amountMinorUnits()
        && amountMinorUnits > 0
        && currency.equals(description.currency());
  }

  private boolean matches(PaymentProof proof) {
    return proof != null
        && hasText(proof.requestId())
        && hasText(proof.paymentId())
        && subscriptionId.equals(proof.subscriptionId())
        && readerId.equals(proof.readerId())
        && columnId.equals(proof.columnId())
        && requestId.equals(proof.paymentRequestId())
        && amountMinorUnits == proof.amountMinorUnits()
        && currency.equals(proof.currency())
        && proof.success()
        && proof.confirmedAt() != null
        && !proof.confirmedAt().isBefore(startedAt)
        && !proof.confirmedAt().isAfter(expiredAt);
  }

  private static String requireText(String value, String field) {
    if (!hasText(value)) {
      throw new IllegalArgumentException(field + " must not be blank");
    }
    return value;
  }

  private static boolean hasText(String value) {
    return value != null && !value.isBlank();
  }
}
