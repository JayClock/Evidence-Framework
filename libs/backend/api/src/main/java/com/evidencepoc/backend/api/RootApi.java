package com.evidencepoc.backend.api;

import com.evidencepoc.backend.api.representation.RootModel;
import com.evidencepoc.backend.domain.IdempotencyLedger;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreements;
import com.evidencepoc.backend.domain.model.Users;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile({"local", "test"})
@Path("/")
public class RootApi {
  private final Users users;
  private final SalesPerformanceAgreements agreements;
  private final IdempotencyLedger idempotencyLedger;
  @Context private ResourceContext resourceContext;

  public RootApi(
      Users users, SalesPerformanceAgreements agreements, IdempotencyLedger idempotencyLedger) {
    this.users = users;
    this.agreements = agreements;
    this.idempotencyLedger = idempotencyLedger;
  }

  @GET
  @Produces({"application/prs.hal-forms+json", "application/hal+json", "application/json"})
  public RootModel get(@Context UriInfo uriInfo) {
    return new RootModel(uriInfo);
  }

  @Path("users")
  public UsersApi users() {
    return resourceContext.initResource(new UsersApi(users));
  }

  @Path("sales-performance-agreements")
  public SalesPerformanceAgreementsApi salesPerformanceAgreements() {
    return resourceContext.initResource(
        new SalesPerformanceAgreementsApi(agreements, idempotencyLedger));
  }
}
