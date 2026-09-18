package com.evidencepoc.backend.api.representation;

import com.evidencepoc.backend.api.ApiTemplates;
import com.evidencepoc.backend.domain.model.CustomerContactRecord;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.time.Instant;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;

@Relation(itemRelation = "customer-contact-record", collectionRelation = "customer-contact-records")
public final class CustomerContactRecordModel
    extends RepresentationModel<CustomerContactRecordModel> {
  @JsonProperty("record_id")
  private final String recordId;

  @JsonProperty("request_id")
  private final String requestId;

  @JsonProperty("agreement_id")
  private final String agreementId;

  @JsonProperty("period_id")
  private final String periodId;

  @JsonProperty("customer_profile_id")
  private final String customerProfileId;

  @JsonProperty("channel")
  private final String channel;

  @JsonProperty("confirmed_at")
  private final Instant confirmedAt;

  public CustomerContactRecordModel(CustomerContactRecord record, UriInfo uriInfo) {
    var description = record.getDescription();
    this.recordId = record.getIdentity();
    this.requestId = description.requestId();
    this.agreementId = description.agreementId();
    this.periodId = description.periodId();
    this.customerProfileId = description.customerProfileId();
    this.channel = description.channel().value();
    this.confirmedAt = description.confirmedAt();
    add(
        Link.of(
                ApiTemplates.relative(
                    ApiTemplates.customerContactRecord(uriInfo, agreementId, requestId, recordId)))
            .withSelfRel());
  }
}
