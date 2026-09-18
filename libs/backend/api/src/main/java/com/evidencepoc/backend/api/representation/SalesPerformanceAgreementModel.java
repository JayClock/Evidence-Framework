package com.evidencepoc.backend.api.representation;

import com.evidencepoc.backend.api.ApiTemplates;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreement;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.time.Instant;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;

@Relation(
    itemRelation = "sales-performance-agreement",
    collectionRelation = "sales-performance-agreements")
public final class SalesPerformanceAgreementModel
    extends RepresentationModel<SalesPerformanceAgreementModel> {
  @JsonProperty("agreement_id")
  private final String agreementId;

  @JsonProperty("signed_at")
  private final Instant signedAt;

  public SalesPerformanceAgreementModel(SalesPerformanceAgreement agreement, UriInfo uriInfo) {
    this.agreementId = agreement.getIdentity();
    this.signedAt = agreement.getDescription().signedAt();
    add(
        Link.of(ApiTemplates.relative(ApiTemplates.salesPerformanceAgreement(uriInfo, agreementId)))
            .withSelfRel());
  }
}
