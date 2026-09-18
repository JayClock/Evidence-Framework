package com.evidencepoc.backend.api;

import com.evidencepoc.backend.api.representation.SalesPerformanceAgreementModel;
import com.evidencepoc.backend.domain.IdempotencyLedger;
import com.evidencepoc.backend.domain.SalesPerformanceAgreementNotFoundException;
import com.evidencepoc.backend.domain.description.SalesPerformanceAgreementDescription;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreement;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreements;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.HeaderParam;
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
public class SalesPerformanceAgreementsApi {
  static final String CAPABILITY = "capability.register-sales-performance-agreement-tele-sales";

  private final SalesPerformanceAgreements agreements;
  private final IdempotencyLedger idempotencyLedger;
  @Context private ResourceContext resourceContext;

  public SalesPerformanceAgreementsApi(
      SalesPerformanceAgreements agreements, IdempotencyLedger idempotencyLedger) {
    this.agreements = agreements;
    this.idempotencyLedger = idempotencyLedger;
  }

  @POST
  @Consumes("application/json")
  public Response create(
      SalesPerformanceAgreementRequest input,
      @HeaderParam("Idempotency-Key") String idempotencyKey,
      @Context UriInfo uriInfo) {
    SalesPerformanceAgreementDescription description =
        SalesPerformanceAgreementRequest.description(input);
    String digest = SalesPerformanceAgreementRequest.digest(input);

    Optional<String> replayed = replay(idempotencyKey, digest);
    if (replayed.isPresent()) {
      Optional<SalesPerformanceAgreement> recorded = agreements.findByIdentity(replayed.get());
      if (recorded.isPresent()) {
        return created(recorded.get(), uriInfo);
      }
    }
    if (agreements.findByIdentity(description.agreementId()).isPresent()) {
      throw new IllegalStateException(
          "Sales performance agreement already exists: " + description.agreementId());
    }
    SalesPerformanceAgreement registered = agreements.register(description);
    if (hasKey(idempotencyKey)) {
      idempotencyLedger.rememberResult(
          CAPABILITY, idempotencyKey, digest, registered.getIdentity());
    }
    return created(registered, uriInfo);
  }

  @Path("{agreementId}")
  public SalesPerformanceAgreementApi findById(@PathParam("agreementId") String agreementId) {
    SalesPerformanceAgreement agreement =
        agreements
            .findByIdentity(agreementId)
            .orElseThrow(() -> new SalesPerformanceAgreementNotFoundException(agreementId));
    return resourceContext.initResource(
        new SalesPerformanceAgreementApi(agreement, idempotencyLedger));
  }

  static boolean hasKey(String idempotencyKey) {
    return idempotencyKey != null && !idempotencyKey.isBlank();
  }

  private Optional<String> replay(String idempotencyKey, String digest) {
    return hasKey(idempotencyKey)
        ? idempotencyLedger.replayedResourceId(CAPABILITY, idempotencyKey, digest)
        : Optional.empty();
  }

  static Response created(SalesPerformanceAgreement agreement, UriInfo uriInfo) {
    return Response.status(Response.Status.CREATED)
        .header(
            "Location",
            ApiTemplates.relative(
                ApiTemplates.salesPerformanceAgreement(uriInfo, agreement.getIdentity())))
        .header("Cache-Control", "no-store")
        .entity(new SalesPerformanceAgreementModel(agreement, uriInfo))
        .build();
  }
}
