package com.evidencepoc.backend.api;

import com.evidencepoc.backend.domain.description.MonthlyCustomerContactTargetDescription;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.BadRequestException;
import java.time.Instant;
import java.util.List;

/** A writable transport bean: immutable records are exposed as read-only by HATEOAS 2.5. */
public final class MonthlyCustomerContactTargetRequest {
  @JsonProperty("request_id")
  private String requestId;

  @JsonProperty("agreement_id")
  private String agreementId;

  @JsonProperty("period_id")
  private String periodId;

  @JsonProperty("started_at")
  private Instant startedAt;

  @JsonProperty("expired_at")
  private Instant expiredAt;

  @JsonProperty("target_contact_count")
  private Integer targetContactCount;

  @JsonProperty("target_phone_count")
  private Integer targetPhoneCount;

  @JsonProperty("target_email_count")
  private Integer targetEmailCount;

  @JsonProperty("evidenceRefs")
  private List<String> evidenceRefs;

  public MonthlyCustomerContactTargetRequest() {}

  public String getRequestId() {
    return requestId;
  }

  public void setRequestId(String requestId) {
    this.requestId = requestId;
  }

  public String getAgreementId() {
    return agreementId;
  }

  public void setAgreementId(String agreementId) {
    this.agreementId = agreementId;
  }

  public String getPeriodId() {
    return periodId;
  }

  public void setPeriodId(String periodId) {
    this.periodId = periodId;
  }

  public Instant getStartedAt() {
    return startedAt;
  }

  public void setStartedAt(Instant startedAt) {
    this.startedAt = startedAt;
  }

  public Instant getExpiredAt() {
    return expiredAt;
  }

  public void setExpiredAt(Instant expiredAt) {
    this.expiredAt = expiredAt;
  }

  public Integer getTargetContactCount() {
    return targetContactCount;
  }

  public void setTargetContactCount(Integer targetContactCount) {
    this.targetContactCount = targetContactCount;
  }

  public Integer getTargetPhoneCount() {
    return targetPhoneCount;
  }

  public void setTargetPhoneCount(Integer targetPhoneCount) {
    this.targetPhoneCount = targetPhoneCount;
  }

  public Integer getTargetEmailCount() {
    return targetEmailCount;
  }

  public void setTargetEmailCount(Integer targetEmailCount) {
    this.targetEmailCount = targetEmailCount;
  }

  public List<String> getEvidenceRefs() {
    return evidenceRefs;
  }

  public void setEvidenceRefs(List<String> evidenceRefs) {
    this.evidenceRefs = evidenceRefs;
  }

  public static MonthlyCustomerContactTargetDescription description(
      MonthlyCustomerContactTargetRequest input) {
    if (input == null) {
      throw new BadRequestException("Request body is required");
    }
    if (input.evidenceRefs == null || input.evidenceRefs.isEmpty()) {
      throw new BadRequestException("evidenceRefs is required");
    }
    return new MonthlyCustomerContactTargetDescription(
        input.requestId,
        input.agreementId,
        input.periodId,
        input.startedAt,
        input.expiredAt,
        count(input.targetContactCount, "target_contact_count"),
        count(input.targetPhoneCount, "target_phone_count"),
        count(input.targetEmailCount, "target_email_count"));
  }

  public static String digest(MonthlyCustomerContactTargetRequest input) {
    return String.join(
        "|",
        String.valueOf(input.requestId),
        String.valueOf(input.agreementId),
        String.valueOf(input.periodId),
        String.valueOf(input.startedAt),
        String.valueOf(input.expiredAt),
        String.valueOf(input.targetContactCount),
        String.valueOf(input.targetPhoneCount),
        String.valueOf(input.targetEmailCount));
  }

  private static int count(Integer value, String field) {
    if (value == null) {
      throw new IllegalArgumentException(field + " is required");
    }
    return value;
  }
}
