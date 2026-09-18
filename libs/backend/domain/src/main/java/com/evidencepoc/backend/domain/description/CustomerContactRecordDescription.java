package com.evidencepoc.backend.domain.description;

import com.evidencepoc.backend.domain.model.ContactChannel;
import java.time.Instant;

public record CustomerContactRecordDescription(
    String recordId,
    String requestId,
    String agreementId,
    String periodId,
    String customerProfileId,
    ContactChannel channel,
    Instant confirmedAt) {

  public CustomerContactRecordDescription {
    recordId = requireText(recordId, "recordId");
    requestId = requireText(requestId, "requestId");
    agreementId = requireText(agreementId, "agreementId");
    periodId = requireText(periodId, "periodId");
    customerProfileId = requireText(customerProfileId, "customerProfileId");
    if (channel == null) {
      throw new IllegalArgumentException("channel is required");
    }
    if (confirmedAt == null) {
      throw new IllegalArgumentException("confirmedAt is required");
    }
  }

  private static String requireText(String value, String field) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(field + " must not be blank");
    }
    return value;
  }
}
