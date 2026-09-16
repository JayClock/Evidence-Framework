package com.evidencepoc.backend.domain.description;

import java.time.Instant;

public record SubscriptionDescription(
    String readerId,
    String columnId,
    String editionId,
    long amountMinorUnits,
    String currency,
    Instant signedAt,
    long paymentSeconds,
    long accessSeconds,
    long refundSeconds,
    long restoreSeconds) {

  public SubscriptionDescription {
    readerId = requireText(readerId, "readerId");
    columnId = requireText(columnId, "columnId");
    editionId = requireText(editionId, "editionId");
    currency = requireText(currency, "currency");
    if (signedAt == null) {
      throw new IllegalArgumentException("signedAt is required");
    }
    requirePositive(amountMinorUnits, "amountMinorUnits");
    requirePositive(paymentSeconds, "paymentSeconds");
    requirePositive(accessSeconds, "accessSeconds");
    requirePositive(refundSeconds, "refundSeconds");
    requirePositive(restoreSeconds, "restoreSeconds");
  }

  private static String requireText(String value, String field) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(field + " must not be blank");
    }
    return value;
  }

  private static void requirePositive(long value, String field) {
    if (value <= 0) {
      throw new IllegalArgumentException(field + " must be positive");
    }
  }
}
