package com.evidencepoc.backend.api;

import com.evidencepoc.backend.domain.description.SalesPerformanceAgreementDescription;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.BadRequestException;
import java.time.Instant;

/** A writable transport bean: immutable records are exposed as read-only by HATEOAS 2.5. */
public final class SalesPerformanceAgreementRequest {
  @JsonProperty("agreement_id")
  private String agreementId;

  @JsonProperty("signed_at")
  private Instant signedAt;

  public SalesPerformanceAgreementRequest() {}

  public String getAgreementId() {
    return agreementId;
  }

  public void setAgreementId(String agreementId) {
    this.agreementId = agreementId;
  }

  public Instant getSignedAt() {
    return signedAt;
  }

  public void setSignedAt(Instant signedAt) {
    this.signedAt = signedAt;
  }

  public static SalesPerformanceAgreementDescription description(
      SalesPerformanceAgreementRequest input) {
    if (input == null) {
      throw new BadRequestException("Request body is required");
    }
    return new SalesPerformanceAgreementDescription(input.agreementId, input.signedAt);
  }

  public static String digest(SalesPerformanceAgreementRequest input) {
    return String.valueOf(input.agreementId) + '|' + input.signedAt;
  }
}
