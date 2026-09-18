package com.evidencepoc.backend.api;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.evidencepoc.backend.domain.IdempotencyKeyReuseException;
import com.evidencepoc.backend.domain.description.SalesPerformanceAgreementDescription;
import java.net.URI;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class SalesPerformanceAgreementsApiTests extends ApiTest {
  private static final String PATH = "/api/sales-performance-agreements";
  private static final String CAPABILITY =
      "capability.register-sales-performance-agreement-tele-sales";

  @Test
  void createReturnsAnAddressableAgreement() {
    when(salesPerformanceAgreements.findByIdentity("PERF-2026-Q4-001"))
        .thenReturn(Optional.empty());
    when(salesPerformanceAgreements.register(
            new SalesPerformanceAgreementDescription(
                "PERF-2026-Q4-001", SalesPerformanceApiFixtures.SIGNED_AT)))
        .thenReturn(SalesPerformanceApiFixtures.agreement());

    String location =
        api()
            .contentType("application/json")
            .header("Idempotency-Key", "idem-agreement")
            .body(Map.of("agreement_id", "PERF-2026-Q4-001", "signed_at", "2026-09-25T09:00:00Z"))
            .post(PATH)
            .then()
            .statusCode(201)
            .header("Cache-Control", containsString("no-store"))
            .body("agreement_id", is("PERF-2026-Q4-001"))
            .body("signed_at", is("2026-09-25T09:00:00Z"))
            .body("_links.self.href", is(PATH + "/PERF-2026-Q4-001"))
            .extract()
            .header("Location");

    assertEquals(PATH + "/PERF-2026-Q4-001", URI.create(location).getPath());
    verify(salesPerformanceAgreements)
        .register(
            new SalesPerformanceAgreementDescription(
                "PERF-2026-Q4-001", SalesPerformanceApiFixtures.SIGNED_AT));
    verify(idempotencyLedger)
        .rememberResult(eq(CAPABILITY), eq("idem-agreement"), anyString(), eq("PERF-2026-Q4-001"));
  }

  @Test
  void replayedIdempotencyKeyReturnsTheRecordedAgreementWithoutRegistering() {
    when(idempotencyLedger.replayedResourceId(eq(CAPABILITY), eq("idem-replay"), anyString()))
        .thenReturn(Optional.of("PERF-2026-Q4-001"));
    when(salesPerformanceAgreements.findByIdentity("PERF-2026-Q4-001"))
        .thenReturn(Optional.of(SalesPerformanceApiFixtures.agreement()));

    String location =
        api()
            .contentType("application/json")
            .header("Idempotency-Key", "idem-replay")
            .body(Map.of("agreement_id", "PERF-2026-Q4-001", "signed_at", "2026-09-25T09:00:00Z"))
            .post(PATH)
            .then()
            .statusCode(201)
            .body("agreement_id", is("PERF-2026-Q4-001"))
            .body("_links.self.href", is(PATH + "/PERF-2026-Q4-001"))
            .extract()
            .header("Location");

    assertEquals(PATH + "/PERF-2026-Q4-001", URI.create(location).getPath());
    verify(salesPerformanceAgreements, never()).register(any());
  }

  @Test
  void duplicateAgreementReturns409WithoutRegistering() {
    when(salesPerformanceAgreements.findByIdentity("PERF-2026-Q4-001"))
        .thenReturn(Optional.of(SalesPerformanceApiFixtures.agreement()));

    api()
        .contentType("application/json")
        .body(Map.of("agreement_id", "PERF-2026-Q4-001", "signed_at", "2026-09-25T09:00:00Z"))
        .post(PATH)
        .then()
        .statusCode(409)
        .body("code", is("SALES_PERFORMANCE_CONFLICT"));

    verify(salesPerformanceAgreements, never()).register(any());
  }

  @Test
  void reusedIdempotencyKeyWithDifferentPayloadReturns409() {
    when(idempotencyLedger.replayedResourceId(eq(CAPABILITY), eq("idem-reuse"), anyString()))
        .thenThrow(new IdempotencyKeyReuseException("idem-reuse"));

    api()
        .contentType("application/json")
        .header("Idempotency-Key", "idem-reuse")
        .body(Map.of("agreement_id", "PERF-2026-Q4-001", "signed_at", "2026-09-25T09:00:00Z"))
        .post(PATH)
        .then()
        .statusCode(409)
        .body("code", is("IDEMPOTENCY_KEY_REUSE"));

    verify(salesPerformanceAgreements, never()).register(any());
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "{\"signed_at\":\"2026-09-25T09:00:00Z\"}",
        "{\"agreement_id\":\"PERF-2026-Q4-001\"}",
        "{\"agreement_id\":\"  \",\"signed_at\":\"2026-09-25T09:00:00Z\"}"
      })
  void invalidAgreementValuesReturn422WithoutWriting(String body) {
    api()
        .contentType("application/json")
        .body(body)
        .post(PATH)
        .then()
        .statusCode(422)
        .body("code", is("INVALID_SALES_PERFORMANCE_INPUT"));

    verifyNoInteractions(salesPerformanceAgreements, idempotencyLedger);
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "{",
        "null",
        "{\"agreement_id\":\"PERF-2026-Q4-001\",\"signed_at\":\"2026-09-25T09:00:00Z\",\"unknown\":1}"
      })
  void malformedAgreementRequestsReturn400WithoutWriting(String body) {
    api().contentType("application/json").body(body).post(PATH).then().statusCode(400);

    verifyNoInteractions(salesPerformanceAgreements, idempotencyLedger);
  }
}
