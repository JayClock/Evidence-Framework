package com.evidencepoc.backend.api.representation;

import com.evidencepoc.backend.api.ApiTemplates;
import com.evidencepoc.backend.domain.model.MonthlyCustomerContactTarget;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.time.Instant;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;

@Relation(
    itemRelation = "monthly-customer-contact-target",
    collectionRelation = "monthly-customer-contact-targets")
public final class MonthlyCustomerContactTargetModel
    extends RepresentationModel<MonthlyCustomerContactTargetModel> {
  @JsonProperty("request_id")
  private final String requestId;

  @JsonProperty("agreement_id")
  private final String agreementId;

  @JsonProperty("period_id")
  private final String periodId;

  @JsonProperty("started_at")
  private final Instant startedAt;

  @JsonProperty("expired_at")
  private final Instant expiredAt;

  @JsonProperty("target_contact_count")
  private final int targetContactCount;

  @JsonProperty("target_phone_count")
  private final int targetPhoneCount;

  @JsonProperty("target_email_count")
  private final int targetEmailCount;

  public MonthlyCustomerContactTargetModel(MonthlyCustomerContactTarget target, UriInfo uriInfo) {
    var description = target.getDescription();
    this.requestId = target.getIdentity();
    this.agreementId = description.agreementId();
    this.periodId = description.periodId();
    this.startedAt = description.startedAt();
    this.expiredAt = description.expiredAt();
    this.targetContactCount = description.targetContactCount();
    this.targetPhoneCount = description.targetPhoneCount();
    this.targetEmailCount = description.targetEmailCount();
    add(
        Link.of(
                ApiTemplates.relative(
                    ApiTemplates.monthlyCustomerContactTarget(uriInfo, agreementId, requestId)))
            .withSelfRel());
  }
}
