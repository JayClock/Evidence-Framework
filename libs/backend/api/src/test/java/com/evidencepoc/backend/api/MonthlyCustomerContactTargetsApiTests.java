package com.evidencepoc.backend.api;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class MonthlyCustomerContactTargetsApiTests extends ApiTest {
  private static final String AGREEMENT_PATH = "/api/sales-performance-agreements/PERF-2026-Q4-001";
  private static final String PATH = AGREEMENT_PATH + "/monthly-customer-contact-targets";
  private static final String CAPABILITY =
      "capability.register-monthly-customer-contact-target-manager";

  @Test
  void createProposesTheTargetUnderTheLocatedAgreement() {
    var targets = new SalesPerformanceApiFixtures.InMemoryTargets();
    when(salesPerformanceAgreements.findByIdentity("PERF-2026-Q4-001"))
        .thenReturn(Optional.of(SalesPerformanceApiFixtures.agreement(targets)));

    String location =
        api()
            .contentType("application/json")
            .header("Idempotency-Key", "idem-target")
            .body(
                targetBody(
                    "PERF-2026-Q4-001", 3, 2, 1, "2026-10-01T00:00:00Z", "2026-10-31T23:59:59Z"))
            .post(PATH)
            .then()
            .statusCode(201)
            .header("Cache-Control", containsString("no-store"))
            .body("request_id", is("CONTACT-2026-10"))
            .body("agreement_id", is("PERF-2026-Q4-001"))
            .body("period_id", is("2026-10"))
            .body("started_at", is("2026-10-01T00:00:00Z"))
            .body("expired_at", is("2026-10-31T23:59:59Z"))
            .body("target_contact_count", is(3))
            .body("target_phone_count", is(2))
            .body("target_email_count", is(1))
            .body("_links.self.href", is(PATH + "/CONTACT-2026-10"))
            .extract()
            .header("Location");

    assertEquals(PATH + "/CONTACT-2026-10", URI.create(location).getPath());
    assertTrue(targets.findByIdentity("CONTACT-2026-10").isPresent());
    verify(idempotencyLedger)
        .rememberResult(eq(CAPABILITY), eq("idem-target"), anyString(), eq("CONTACT-2026-10"));
  }

  @Test
  void replayedIdempotencyKeyReturnsTheRecordedTargetWithoutProposingAgain() {
    var targets = new SalesPerformanceApiFixtures.InMemoryTargets();
    targets.seed(SalesPerformanceApiFixtures.target());
    when(salesPerformanceAgreements.findByIdentity("PERF-2026-Q4-001"))
        .thenReturn(Optional.of(SalesPerformanceApiFixtures.agreement(targets)));
    when(idempotencyLedger.replayedResourceId(eq(CAPABILITY), eq("idem-replay"), anyString()))
        .thenReturn(Optional.of("CONTACT-2026-10"));

    api()
        .contentType("application/json")
        .header("Idempotency-Key", "idem-replay")
        .body(
            targetBody("PERF-2026-Q4-001", 3, 2, 1, "2026-10-01T00:00:00Z", "2026-10-31T23:59:59Z"))
        .post(PATH)
        .then()
        .statusCode(201)
        .body("request_id", is("CONTACT-2026-10"))
        .body("_links.self.href", is(PATH + "/CONTACT-2026-10"));

    assertEquals(1, targets.findAll().size());
  }

  @Test
  void duplicateTargetReturns409WithoutProposingAgain() {
    var targets = new SalesPerformanceApiFixtures.InMemoryTargets();
    targets.seed(SalesPerformanceApiFixtures.target());
    when(salesPerformanceAgreements.findByIdentity("PERF-2026-Q4-001"))
        .thenReturn(Optional.of(SalesPerformanceApiFixtures.agreement(targets)));

    api()
        .contentType("application/json")
        .body(
            targetBody("PERF-2026-Q4-001", 3, 2, 1, "2026-10-01T00:00:00Z", "2026-10-31T23:59:59Z"))
        .post(PATH)
        .then()
        .statusCode(409)
        .body("code", is("SALES_PERFORMANCE_CONFLICT"));

    assertEquals(1, targets.findAll().size());
  }

  @Test
  void missingParentAgreementReturns404() {
    when(salesPerformanceAgreements.findByIdentity("PERF-2026-Q4-001"))
        .thenReturn(Optional.empty());

    api()
        .contentType("application/json")
        .body(
            targetBody("PERF-2026-Q4-001", 3, 2, 1, "2026-10-01T00:00:00Z", "2026-10-31T23:59:59Z"))
        .post(PATH)
        .then()
        .statusCode(404)
        .body("code", is("SALES_PERFORMANCE_AGREEMENT_NOT_FOUND"));

    verify(salesPerformanceAgreements, never()).register(any());
  }

  @Test
  void foreignAgreementReturns422WithoutProposing() {
    var targets = new SalesPerformanceApiFixtures.InMemoryTargets();
    when(salesPerformanceAgreements.findByIdentity("PERF-2026-Q4-001"))
        .thenReturn(Optional.of(SalesPerformanceApiFixtures.agreement(targets)));

    api()
        .contentType("application/json")
        .body(targetBody("PERF-OTHER", 3, 2, 1, "2026-10-01T00:00:00Z", "2026-10-31T23:59:59Z"))
        .post(PATH)
        .then()
        .statusCode(422)
        .body("code", is("INVALID_SALES_PERFORMANCE_INPUT"));

    assertEquals(0, targets.findAll().size());
  }

  @Test
  void invalidTargetValuesReturn422WithoutProposing() {
    var targets = new SalesPerformanceApiFixtures.InMemoryTargets();
    when(salesPerformanceAgreements.findByIdentity("PERF-2026-Q4-001"))
        .thenReturn(Optional.of(SalesPerformanceApiFixtures.agreement(targets)));

    assertRejected(
        targetBody("PERF-2026-Q4-001", -1, 2, 1, "2026-10-01T00:00:00Z", "2026-10-31T23:59:59Z"));
    assertRejected(
        targetBody("PERF-2026-Q4-001", 3, -1, 1, "2026-10-01T00:00:00Z", "2026-10-31T23:59:59Z"));
    assertRejected(
        targetBody("PERF-2026-Q4-001", 3, 2, -1, "2026-10-01T00:00:00Z", "2026-10-31T23:59:59Z"));
    assertRejected(
        targetBody("PERF-2026-Q4-001", 3, 2, 1, "2026-11-01T00:00:00Z", "2026-10-31T23:59:59Z"));

    assertEquals(0, targets.findAll().size());
  }

  private void assertRejected(Map<String, Object> body) {
    api()
        .contentType("application/json")
        .body(body)
        .post(PATH)
        .then()
        .statusCode(422)
        .body("code", is("INVALID_SALES_PERFORMANCE_INPUT"));
  }

  @Test
  void emptyEvidenceRefsReturns400WithoutProposing() {
    var targets = new SalesPerformanceApiFixtures.InMemoryTargets();
    when(salesPerformanceAgreements.findByIdentity("PERF-2026-Q4-001"))
        .thenReturn(Optional.of(SalesPerformanceApiFixtures.agreement(targets)));

    api()
        .contentType("application/json")
        .body(
            targetBody(
                "PERF-2026-Q4-001",
                3,
                2,
                1,
                "2026-10-01T00:00:00Z",
                "2026-10-31T23:59:59Z",
                List.of()))
        .post(PATH)
        .then()
        .statusCode(400)
        .body("code", is("BAD_REQUEST"));

    assertEquals(0, targets.findAll().size());
  }

  private static Map<String, Object> targetBody(
      String agreementId,
      int contactCount,
      int phoneCount,
      int emailCount,
      String startedAt,
      String expiredAt) {
    return targetBody(
        agreementId,
        contactCount,
        phoneCount,
        emailCount,
        startedAt,
        expiredAt,
        List.of("instance.sales-performance-agreement"));
  }

  private static Map<String, Object> targetBody(
      String agreementId,
      int contactCount,
      int phoneCount,
      int emailCount,
      String startedAt,
      String expiredAt,
      List<String> evidenceRefs) {
    return Map.ofEntries(
        Map.entry("request_id", "CONTACT-2026-10"),
        Map.entry("agreement_id", agreementId),
        Map.entry("period_id", "2026-10"),
        Map.entry("started_at", startedAt),
        Map.entry("expired_at", expiredAt),
        Map.entry("target_contact_count", contactCount),
        Map.entry("target_phone_count", phoneCount),
        Map.entry("target_email_count", emailCount),
        Map.entry("evidenceRefs", evidenceRefs));
  }
}
