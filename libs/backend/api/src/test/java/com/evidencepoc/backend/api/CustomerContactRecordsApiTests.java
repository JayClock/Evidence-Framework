package com.evidencepoc.backend.api;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.evidencepoc.backend.domain.description.CustomerContactRecordDescription;
import com.evidencepoc.backend.domain.model.ContactChannel;
import com.evidencepoc.backend.domain.model.CustomerContactRecord;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreement;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class CustomerContactRecordsApiTests extends ApiTest {
  private static final String AGREEMENT_PATH = "/api/sales-performance-agreements/PERF-2026-Q4-001";
  private static final String TARGET_PATH =
      AGREEMENT_PATH + "/monthly-customer-contact-targets/CONTACT-2026-10";
  private static final String PATH = TARGET_PATH + "/contact-records";
  private static final String CAPABILITY = "capability.register-customer-contact-record-tele-sales";

  private SalesPerformanceApiFixtures.InMemoryRecords records;
  private SalesPerformanceApiFixtures.InMemoryTargets targets;

  @BeforeEach
  void locateTargetWithRecords() {
    records = new SalesPerformanceApiFixtures.InMemoryRecords();
    targets = new SalesPerformanceApiFixtures.InMemoryTargets();
    targets.seed(SalesPerformanceApiFixtures.target(records));
    SalesPerformanceAgreement agreement = SalesPerformanceApiFixtures.agreement(targets);
    when(salesPerformanceAgreements.findByIdentity("PERF-2026-Q4-001"))
        .thenReturn(Optional.of(agreement));
  }

  @Test
  void createRegistersTheRecordUnderTheLocatedTarget() {
    String location =
        api()
            .contentType("application/json")
            .header("Idempotency-Key", "idem-record")
            .body(recordBody("CONTACT-2026-10", "2026-10", "phone", "2026-10-03T02:00:00Z"))
            .post(PATH)
            .then()
            .statusCode(201)
            .header("Cache-Control", containsString("no-store"))
            .body("record_id", is("CONTACT-REC-001"))
            .body("request_id", is("CONTACT-2026-10"))
            .body("agreement_id", is("PERF-2026-Q4-001"))
            .body("period_id", is("2026-10"))
            .body("customer_profile_id", is("CUSTOMER-001"))
            .body("channel", is("phone"))
            .body("confirmed_at", is("2026-10-03T02:00:00Z"))
            .body("_links.self.href", is(PATH + "/CONTACT-REC-001"))
            .extract()
            .header("Location");

    assertEquals(PATH + "/CONTACT-REC-001", URI.create(location).getPath());
    assertEquals(1, records.findAll().size());
    verify(idempotencyLedger)
        .rememberResult(eq(CAPABILITY), eq("idem-record"), anyString(), eq("CONTACT-REC-001"));
  }

  @Test
  void replayedIdempotencyKeyReturnsTheRecordedRecordWithoutAppendingAgain() {
    records.seed(new CustomerContactRecord("CONTACT-REC-001", recordDescription("phone")));
    when(idempotencyLedger.replayedResourceId(eq(CAPABILITY), eq("idem-replay"), anyString()))
        .thenReturn(Optional.of("CONTACT-REC-001"));

    api()
        .contentType("application/json")
        .header("Idempotency-Key", "idem-replay")
        .body(recordBody("CONTACT-2026-10", "2026-10", "phone", "2026-10-03T02:00:00Z"))
        .post(PATH)
        .then()
        .statusCode(201)
        .body("record_id", is("CONTACT-REC-001"))
        .body("_links.self.href", is(PATH + "/CONTACT-REC-001"));

    assertEquals(1, records.findAll().size());
  }

  @Test
  void duplicateRecordReturns409WithoutAppendingAgain() {
    records.seed(new CustomerContactRecord("CONTACT-REC-001", recordDescription("phone")));

    api()
        .contentType("application/json")
        .body(recordBody("CONTACT-2026-10", "2026-10", "phone", "2026-10-03T02:00:00Z"))
        .post(PATH)
        .then()
        .statusCode(409)
        .body("code", is("SALES_PERFORMANCE_CONFLICT"));

    assertEquals(1, records.findAll().size());
  }

  @Test
  void missingParentTargetReturns404() {
    api()
        .contentType("application/json")
        .body(recordBody("CONTACT-2026-10", "2026-10", "phone", "2026-10-03T02:00:00Z"))
        .post(AGREEMENT_PATH + "/monthly-customer-contact-targets/CONTACT-MISSING/contact-records")
        .then()
        .statusCode(404);

    assertEquals(0, records.findAll().size());
  }

  @ParameterizedTest
  @ValueSource(strings = {"sms", "PHONE", ""})
  void unknownChannelReturns422WithoutAppending(String channel) {
    api()
        .contentType("application/json")
        .body(recordBody("CONTACT-2026-10", "2026-10", channel, "2026-10-03T02:00:00Z"))
        .post(PATH)
        .then()
        .statusCode(422)
        .body("code", is("INVALID_SALES_PERFORMANCE_INPUT"));

    assertEquals(0, records.findAll().size());
  }

  @Test
  void mismatchedPeriodReturns422WithoutAppending() {
    api()
        .contentType("application/json")
        .body(recordBody("CONTACT-2026-10", "2026-11", "phone", "2026-10-03T02:00:00Z"))
        .post(PATH)
        .then()
        .statusCode(422)
        .body("code", is("INVALID_SALES_PERFORMANCE_INPUT"));

    assertEquals(0, records.findAll().size());
  }

  @Test
  void missingConfirmedAtReturns422WithoutAppending() {
    Map<String, Object> body = new java.util.HashMap<>();
    body.put("record_id", "CONTACT-REC-001");
    body.put("request_id", "CONTACT-2026-10");
    body.put("agreement_id", "PERF-2026-Q4-001");
    body.put("period_id", "2026-10");
    body.put("customer_profile_id", "CUSTOMER-001");
    body.put("channel", "phone");
    body.put("evidenceRefs", List.of("instance.monthly-customer-contact-request"));

    api()
        .contentType("application/json")
        .body(body)
        .post(PATH)
        .then()
        .statusCode(422)
        .body("code", is("INVALID_SALES_PERFORMANCE_INPUT"));

    assertEquals(0, records.findAll().size());
  }

  @Test
  void emptyEvidenceRefsReturns400WithoutAppending() {
    Map<String, Object> body = new java.util.HashMap<>();
    body.put("record_id", "CONTACT-REC-001");
    body.put("request_id", "CONTACT-2026-10");
    body.put("agreement_id", "PERF-2026-Q4-001");
    body.put("period_id", "2026-10");
    body.put("customer_profile_id", "CUSTOMER-001");
    body.put("channel", "phone");
    body.put("confirmed_at", "2026-10-03T02:00:00Z");
    body.put("evidenceRefs", List.of());

    api()
        .contentType("application/json")
        .body(body)
        .post(PATH)
        .then()
        .statusCode(400)
        .body("code", is("BAD_REQUEST"));

    assertEquals(0, records.findAll().size());
  }

  private static CustomerContactRecordDescription recordDescription(String channel) {
    return new CustomerContactRecordDescription(
        "CONTACT-REC-001",
        "CONTACT-2026-10",
        "PERF-2026-Q4-001",
        "2026-10",
        "CUSTOMER-001",
        ContactChannel.fromValue(channel),
        Instant.parse("2026-10-03T02:00:00Z"));
  }

  private static Map<String, Object> recordBody(
      String requestId, String periodId, String channel, String confirmedAt) {
    return Map.of(
        "record_id",
        "CONTACT-REC-001",
        "request_id",
        requestId,
        "agreement_id",
        "PERF-2026-Q4-001",
        "period_id",
        periodId,
        "customer_profile_id",
        "CUSTOMER-001",
        "channel",
        channel,
        "confirmed_at",
        confirmedAt,
        "evidenceRefs",
        List.of("instance.monthly-customer-contact-request"));
  }
}
