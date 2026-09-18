package com.evidencepoc.backend.domain.description;

import java.time.Instant;

public record MonthlyCustomerContactTargetDescription(
    String requestId,
    String agreementId,
    String periodId,
    Instant startedAt,
    Instant expiredAt,
    int targetContactCount,
    int targetPhoneCount,
    int targetEmailCount) {

  public MonthlyCustomerContactTargetDescription {
    requestId = requireText(requestId, "requestId");
    agreementId = requireText(agreementId, "agreementId");
    periodId = requireText(periodId, "periodId");
    if (startedAt == null) {
      throw new IllegalArgumentException("startedAt is required");
    }
    if (expiredAt == null) {
      throw new IllegalArgumentException("expiredAt is required");
    }
    if (startedAt.isAfter(expiredAt)) {
      throw new IllegalArgumentException("startedAt must not be after expiredAt");
    }
    requireNonNegative(targetContactCount, "targetContactCount");
    requireNonNegative(targetPhoneCount, "targetPhoneCount");
    requireNonNegative(targetEmailCount, "targetEmailCount");
  }

  private static String requireText(String value, String field) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(field + " must not be blank");
    }
    return value;
  }

  private static void requireNonNegative(int value, String field) {
    if (value < 0) {
      throw new IllegalArgumentException(field + " must not be negative");
    }
  }
}
