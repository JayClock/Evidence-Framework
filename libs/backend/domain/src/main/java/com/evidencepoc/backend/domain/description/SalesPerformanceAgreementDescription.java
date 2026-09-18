package com.evidencepoc.backend.domain.description;

import java.time.Instant;

public record SalesPerformanceAgreementDescription(String agreementId, Instant signedAt) {
  public SalesPerformanceAgreementDescription {
    agreementId = requireText(agreementId, "agreementId");
    if (signedAt == null) {
      throw new IllegalArgumentException("signedAt is required");
    }
  }

  private static String requireText(String value, String field) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(field + " must not be blank");
    }
    return value;
  }
}
