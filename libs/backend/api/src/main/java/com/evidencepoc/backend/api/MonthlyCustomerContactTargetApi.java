package com.evidencepoc.backend.api;

import com.evidencepoc.backend.domain.IdempotencyLedger;
import com.evidencepoc.backend.domain.model.MonthlyCustomerContactTarget;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;

@Produces({"application/prs.hal-forms+json", "application/hal+json", "application/json"})
public class MonthlyCustomerContactTargetApi {
  private final MonthlyCustomerContactTarget target;
  private final IdempotencyLedger idempotencyLedger;
  @Context private ResourceContext resourceContext;

  public MonthlyCustomerContactTargetApi(
      MonthlyCustomerContactTarget target, IdempotencyLedger idempotencyLedger) {
    this.target = target;
    this.idempotencyLedger = idempotencyLedger;
  }

  @Path("contact-records")
  public CustomerContactRecordsApi records() {
    return resourceContext.initResource(new CustomerContactRecordsApi(target, idempotencyLedger));
  }
}
