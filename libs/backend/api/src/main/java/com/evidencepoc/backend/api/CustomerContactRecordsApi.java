package com.evidencepoc.backend.api;

import com.evidencepoc.backend.api.representation.CustomerContactRecordModel;
import com.evidencepoc.backend.domain.IdempotencyLedger;
import com.evidencepoc.backend.domain.description.CustomerContactRecordDescription;
import com.evidencepoc.backend.domain.model.CustomerContactRecord;
import com.evidencepoc.backend.domain.model.MonthlyCustomerContactTarget;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.util.Optional;

@Produces({"application/prs.hal-forms+json", "application/hal+json", "application/json"})
public class CustomerContactRecordsApi {
  static final String CAPABILITY = "capability.register-customer-contact-record-tele-sales";

  private final MonthlyCustomerContactTarget target;
  private final IdempotencyLedger idempotencyLedger;

  public CustomerContactRecordsApi(
      MonthlyCustomerContactTarget target, IdempotencyLedger idempotencyLedger) {
    this.target = target;
    this.idempotencyLedger = idempotencyLedger;
  }

  @POST
  @Consumes("application/json")
  public Response create(
      CustomerContactRecordRequest input,
      @HeaderParam("Idempotency-Key") String idempotencyKey,
      @Context UriInfo uriInfo) {
    CustomerContactRecordDescription description = CustomerContactRecordRequest.description(input);
    String digest = CustomerContactRecordRequest.digest(input);

    Optional<String> replayed = replay(idempotencyKey, digest);
    if (replayed.isPresent()) {
      Optional<CustomerContactRecord> recorded = target.records().findByIdentity(replayed.get());
      if (recorded.isPresent()) {
        return created(recorded.get(), uriInfo);
      }
    }
    if (target.records().findByIdentity(description.recordId()).isPresent()) {
      throw new IllegalStateException(
          "Customer contact record already exists: " + description.recordId());
    }
    CustomerContactRecord registered = target.registerContactRecord(description);
    if (SalesPerformanceAgreementsApi.hasKey(idempotencyKey)) {
      idempotencyLedger.rememberResult(
          CAPABILITY, idempotencyKey, digest, registered.getIdentity());
    }
    return created(registered, uriInfo);
  }

  private Optional<String> replay(String idempotencyKey, String digest) {
    return SalesPerformanceAgreementsApi.hasKey(idempotencyKey)
        ? idempotencyLedger.replayedResourceId(CAPABILITY, idempotencyKey, digest)
        : Optional.empty();
  }

  static Response created(CustomerContactRecord record, UriInfo uriInfo) {
    var description = record.getDescription();
    return Response.status(Response.Status.CREATED)
        .header(
            "Location",
            ApiTemplates.relative(
                ApiTemplates.customerContactRecord(
                    uriInfo,
                    description.agreementId(),
                    description.requestId(),
                    record.getIdentity())))
        .header("Cache-Control", "no-store")
        .entity(new CustomerContactRecordModel(record, uriInfo))
        .build();
  }
}
