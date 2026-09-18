package com.evidencepoc.backend.api;

import com.evidencepoc.backend.domain.IdempotencyLedger;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreement;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;

@Produces({"application/prs.hal-forms+json", "application/hal+json", "application/json"})
public class SalesPerformanceAgreementApi {
  private final SalesPerformanceAgreement agreement;
  private final IdempotencyLedger idempotencyLedger;
  @Context private ResourceContext resourceContext;

  public SalesPerformanceAgreementApi(
      SalesPerformanceAgreement agreement, IdempotencyLedger idempotencyLedger) {
    this.agreement = agreement;
    this.idempotencyLedger = idempotencyLedger;
  }

  @Path("monthly-customer-contact-targets")
  public MonthlyCustomerContactTargetsApi targets() {
    return resourceContext.initResource(
        new MonthlyCustomerContactTargetsApi(agreement, idempotencyLedger));
  }
}
