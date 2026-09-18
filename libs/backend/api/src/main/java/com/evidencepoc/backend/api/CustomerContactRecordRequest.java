package com.evidencepoc.backend.api;

import com.evidencepoc.backend.domain.description.CustomerContactRecordDescription;
import com.evidencepoc.backend.domain.model.ContactChannel;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.BadRequestException;
import java.time.Instant;
import java.util.List;

/** A writable transport bean: immutable records are exposed as read-only by HATEOAS 2.5. */
public final class CustomerContactRecordRequest {
  @JsonProperty("record_id")
  private String recordId;

  @JsonProperty("request_id")
  private String requestId;

  @JsonProperty("agreement_id")
  private String agreementId;

  @JsonProperty("period_id")
  private String periodId;

  @JsonProperty("customer_profile_id")
  private String customerProfileId;

  @JsonProperty("channel")
  private String channel;

  @JsonProperty("confirmed_at")
  private Instant confirmedAt;

  @JsonProperty("evidenceRefs")
  private List<String> evidenceRefs;

  public CustomerContactRecordRequest() {}

  public String getRecordId() {
    return recordId;
  }

  public void setRecordId(String recordId) {
    this.recordId = recordId;
  }

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

  public String getCustomerProfileId() {
    return customerProfileId;
  }

  public void setCustomerProfileId(String customerProfileId) {
    this.customerProfileId = customerProfileId;
  }

  public String getChannel() {
    return channel;
  }

  public void setChannel(String channel) {
    this.channel = channel;
  }

  public Instant getConfirmedAt() {
    return confirmedAt;
  }

  public void setConfirmedAt(Instant confirmedAt) {
    this.confirmedAt = confirmedAt;
  }

  public List<String> getEvidenceRefs() {
    return evidenceRefs;
  }

  public void setEvidenceRefs(List<String> evidenceRefs) {
    this.evidenceRefs = evidenceRefs;
  }

  public static CustomerContactRecordDescription description(CustomerContactRecordRequest input) {
    if (input == null) {
      throw new BadRequestException("Request body is required");
    }
    if (input.evidenceRefs == null || input.evidenceRefs.isEmpty()) {
      throw new BadRequestException("evidenceRefs is required");
    }
    return new CustomerContactRecordDescription(
        input.recordId,
        input.requestId,
        input.agreementId,
        input.periodId,
        input.customerProfileId,
        ContactChannel.fromValue(input.channel),
        input.confirmedAt);
  }

  public static String digest(CustomerContactRecordRequest input) {
    return String.join(
        "|",
        String.valueOf(input.recordId),
        String.valueOf(input.requestId),
        String.valueOf(input.agreementId),
        String.valueOf(input.periodId),
        String.valueOf(input.customerProfileId),
        String.valueOf(input.channel),
        String.valueOf(input.confirmedAt));
  }
}
