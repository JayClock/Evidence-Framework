package com.evidencepoc.backend.api;

import com.evidencepoc.backend.api.representation.MonthlyCustomerContactTargetModel;
import com.evidencepoc.backend.domain.IdempotencyLedger;
import com.evidencepoc.backend.domain.description.MonthlyCustomerContactTargetDescription;
import com.evidencepoc.backend.domain.model.MonthlyCustomerContactTarget;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreement;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.util.Optional;

@Produces({"application/prs.hal-forms+json", "application/hal+json", "application/json"})
public class MonthlyCustomerContactTargetsApi {
  static final String CAPABILITY = "capability.register-monthly-customer-contact-target-manager";

  private final SalesPerformanceAgreement agreement;
  private final IdempotencyLedger idempotencyLedger;
  @Context private ResourceContext resourceContext;

  public MonthlyCustomerContactTargetsApi(
      SalesPerformanceAgreement agreement, IdempotencyLedger idempotencyLedger) {
    this.agreement = agreement;
    this.idempotencyLedger = idempotencyLedger;
  }

  @POST
  @Consumes("application/json")
  public Response create(
      MonthlyCustomerContactTargetRequest input,
      @HeaderParam("Idempotency-Key") String idempotencyKey,
      @Context UriInfo uriInfo) {
    MonthlyCustomerContactTargetDescription description =
        MonthlyCustomerContactTargetRequest.description(input);
    String digest = MonthlyCustomerContactTargetRequest.digest(input);

    Optional<String> replayed = replay(idempotencyKey, digest);
    if (replayed.isPresent()) {
      Optional<MonthlyCustomerContactTarget> recorded =
          agreement.targets().findByIdentity(replayed.get());
      if (recorded.isPresent()) {
        return created(recorded.get(), uriInfo);
      }
    }
    if (agreement.targets().findByIdentity(description.requestId()).isPresent()) {
      throw new IllegalStateException(
          "Monthly customer contact target already exists: " + description.requestId());
    }
    MonthlyCustomerContactTarget registered = agreement.proposeTarget(description);
    if (SalesPerformanceAgreementsApi.hasKey(idempotencyKey)) {
      idempotencyLedger.rememberResult(
          CAPABILITY, idempotencyKey, digest, registered.getIdentity());
    }
    return created(registered, uriInfo);
  }

  @Path("{targetId}")
  public MonthlyCustomerContactTargetApi findById(@PathParam("targetId") String targetId) {
    MonthlyCustomerContactTarget target =
        agreement.targets().findByIdentity(targetId).orElseThrow(NotFoundException::new);
    return resourceContext.initResource(
        new MonthlyCustomerContactTargetApi(target, idempotencyLedger));
  }

  private Optional<String> replay(String idempotencyKey, String digest) {
    return SalesPerformanceAgreementsApi.hasKey(idempotencyKey)
        ? idempotencyLedger.replayedResourceId(CAPABILITY, idempotencyKey, digest)
        : Optional.empty();
  }

  static Response created(MonthlyCustomerContactTarget target, UriInfo uriInfo) {
    return Response.status(Response.Status.CREATED)
        .header(
            "Location",
            ApiTemplates.relative(
                ApiTemplates.monthlyCustomerContactTarget(
                    uriInfo, target.getDescription().agreementId(), target.getIdentity())))
        .header("Cache-Control", "no-store")
        .entity(new MonthlyCustomerContactTargetModel(target, uriInfo))
        .build();
  }
}
