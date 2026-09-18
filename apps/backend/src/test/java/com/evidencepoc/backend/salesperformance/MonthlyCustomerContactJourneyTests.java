package com.evidencepoc.backend.salesperformance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.evidencepoc.backend.domain.model.MonthlyCustomerContactTarget;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreement;
import com.evidencepoc.backend.persistent.associations.SalesPerformanceAgreements;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class MonthlyCustomerContactJourneyTests {
  private static final String HAL_FORMS = "application/prs.hal-forms+json";
  private static final String AGREEMENTS = "/api/sales-performance-agreements";
  private static final String AGREEMENT_ID = "PERF-2026-Q4-001";
  private static final String TARGETS =
      AGREEMENTS + "/" + AGREEMENT_ID + "/monthly-customer-contact-targets";

  @Autowired TestRestTemplate http;
  @Autowired ObjectMapper json;
  @Autowired JdbcTemplate jdbc;
  @Autowired SalesPerformanceAgreements agreements;

  @BeforeEach
  void clearFacts() {
    jdbc.update("DELETE FROM customer_contact_records");
    jdbc.update("DELETE FROM monthly_customer_contact_targets");
    jdbc.update("DELETE FROM sales_performance_agreements");
    jdbc.update("DELETE FROM sales_performance_idempotency");
  }

  @Test
  void completedJourneyReachesAllThreeTargets() throws Exception {
    ResponseEntity<String> agreementResponse =
        post(AGREEMENTS, agreementBody(), "idem-journey-agreement");
    assertEquals(201, agreementResponse.getStatusCode().value(), agreementResponse.getBody());
    assertEquals(AGREEMENTS + "/" + AGREEMENT_ID, path(agreementResponse));
    assertTrue(agreementResponse.getHeaders().getFirst("Cache-Control").contains("no-store"));
    assertEquals(
        AGREEMENTS + "/" + AGREEMENT_ID, tree(agreementResponse).at("/_links/self/href").asText());

    ResponseEntity<String> targetResponse =
        post(TARGETS, targetBody("CONTACT-2026-10", 3, 2, 1), "idem-journey-target");
    assertEquals(201, targetResponse.getStatusCode().value(), targetResponse.getBody());
    assertEquals(TARGETS + "/CONTACT-2026-10", path(targetResponse));
    assertTrue(targetResponse.getHeaders().getFirst("Cache-Control").contains("no-store"));
    assertEquals(
        TARGETS + "/CONTACT-2026-10", tree(targetResponse).at("/_links/self/href").asText());

    String records = TARGETS + "/CONTACT-2026-10/contact-records";
    assertEquals(
        201,
        post(
                records,
                recordBody(
                    "CONTACT-REC-001",
                    "CONTACT-2026-10",
                    "2026-10",
                    "CUSTOMER-001",
                    "phone",
                    "2026-10-03T02:00:00Z"),
                "idem-journey-rec-1")
            .getStatusCode()
            .value());
    assertEquals(
        201,
        post(
                records,
                recordBody(
                    "CONTACT-REC-002",
                    "CONTACT-2026-10",
                    "2026-10",
                    "CUSTOMER-002",
                    "email",
                    "2026-10-10T06:30:00Z"),
                "idem-journey-rec-2")
            .getStatusCode()
            .value());
    ResponseEntity<String> third =
        post(
            records,
            recordBody(
                "CONTACT-REC-003",
                "CONTACT-2026-10",
                "2026-10",
                "CUSTOMER-003",
                "phone",
                "2026-10-28T08:15:00Z"),
            "idem-journey-rec-3");
    assertEquals(201, third.getStatusCode().value(), third.getBody());
    assertEquals(records + "/CONTACT-REC-003", path(third));
    assertTrue(third.getHeaders().getFirst("Cache-Control").contains("no-store"));

    assertEquals(1, rows("sales_performance_agreements"));
    assertEquals(1, rows("monthly_customer_contact_targets"));
    assertEquals(3, rows("customer_contact_records"));
    assertEquals(
        List.of("PHONE", "EMAIL", "PHONE"),
        jdbc.queryForList(
            "SELECT channel FROM customer_contact_records WHERE request_id = ? ORDER BY confirmed_at",
            String.class,
            "CONTACT-2026-10"));
    assertEquals(
        Instant.parse("2026-10-03T02:00:00Z"),
        jdbc.queryForObject(
                "SELECT confirmed_at FROM customer_contact_records WHERE record_id = ?",
                Timestamp.class,
                "CONTACT-REC-001")
            .toInstant());

    SalesPerformanceAgreement reloaded = agreements.findByIdentity(AGREEMENT_ID).orElseThrow();
    MonthlyCustomerContactTarget target =
        reloaded.targets().findByIdentity("CONTACT-2026-10").orElseThrow();
    assertEquals(3, target.records().findAll().size());
    assertEquals(Map.of("phone", 2L, "email", 1L), channelCounts("CONTACT-2026-10"));
    assertTrue(
        target.isCompleted(), "the completed scenario must satisfy the monthly contact rule");
  }

  @Test
  void insufficientJourneyStaysPendingAndBoundariesAreInclusive() throws Exception {
    assertEquals(
        201, post(AGREEMENTS, agreementBody(), "idem-boundary-agreement").getStatusCode().value());
    assertEquals(
        201,
        post(TARGETS, targetBody("CONTACT-2026-10", 3, 2, 1), "idem-boundary-target")
            .getStatusCode()
            .value());

    String insufficientRecords = TARGETS + "/CONTACT-2026-10/contact-records";
    assertEquals(
        201,
        post(
                insufficientRecords,
                recordBody(
                    "CONTACT-REC-001",
                    "CONTACT-2026-10",
                    "2026-10",
                    "CUSTOMER-001",
                    "phone",
                    "2026-10-03T02:00:00Z"),
                "idem-insufficient-1")
            .getStatusCode()
            .value());
    ResponseEntity<String> second =
        post(
            insufficientRecords,
            recordBody(
                "CONTACT-REC-002",
                "CONTACT-2026-10",
                "2026-10",
                "CUSTOMER-002",
                "email",
                "2026-10-10T06:30:00Z"),
            "idem-insufficient-2");
    assertEquals(201, second.getStatusCode().value(), second.getBody());
    assertFalse(tree(second).has("breached"), "the journey must not invent breach artifacts");
    assertFalse(
        ruleCompleted("CONTACT-2026-10"),
        "one phone contact below the agreed phone target stays pending");

    assertEquals(
        201,
        post(TARGETS, targetBody("CONTACT-2026-10-EXPIRED", 1, 1, 0), "idem-boundary-expired")
            .getStatusCode()
            .value());
    assertEquals(
        201,
        post(
                TARGETS + "/CONTACT-2026-10-EXPIRED/contact-records",
                recordBody(
                    "CONTACT-REC-003",
                    "CONTACT-2026-10-EXPIRED",
                    "2026-10",
                    "CUSTOMER-003",
                    "phone",
                    "2026-10-31T23:59:59Z"),
                "idem-boundary-expired-record")
            .getStatusCode()
            .value());
    assertTrue(
        ruleCompleted("CONTACT-2026-10-EXPIRED"), "a record exactly at expired_at is counted");

    assertEquals(
        201,
        post(TARGETS, targetBody("CONTACT-2026-10-BEFORE", 1, 1, 0), "idem-boundary-before")
            .getStatusCode()
            .value());
    assertEquals(
        201,
        post(
                TARGETS + "/CONTACT-2026-10-BEFORE/contact-records",
                recordBody(
                    "CONTACT-REC-004",
                    "CONTACT-2026-10-BEFORE",
                    "2026-10",
                    "CUSTOMER-001",
                    "phone",
                    "2026-09-30T23:59:59Z"),
                "idem-boundary-before-record")
            .getStatusCode()
            .value());
    assertFalse(
        ruleCompleted("CONTACT-2026-10-BEFORE"), "a record before started_at is not counted");

    assertEquals(
        201,
        post(TARGETS, targetBody("CONTACT-2026-10-AFTER", 1, 1, 0), "idem-boundary-after")
            .getStatusCode()
            .value());
    assertEquals(
        201,
        post(
                TARGETS + "/CONTACT-2026-10-AFTER/contact-records",
                recordBody(
                    "CONTACT-REC-005",
                    "CONTACT-2026-10-AFTER",
                    "2026-10",
                    "CUSTOMER-002",
                    "phone",
                    "2026-11-01T00:00:00Z"),
                "idem-boundary-after-record")
            .getStatusCode()
            .value());
    assertFalse(ruleCompleted("CONTACT-2026-10-AFTER"), "a record after expired_at is not counted");

    assertEquals(5, rows("customer_contact_records"));
    assertEquals(4, rows("monthly_customer_contact_targets"));

    assertEquals(
        422,
        post(
                insufficientRecords,
                recordBody(
                    "CONTACT-REC-900",
                    "CONTACT-2026-10",
                    "2026-11",
                    "CUSTOMER-001",
                    "phone",
                    "2026-10-05T00:00:00Z"),
                "idem-mismatched-period")
            .getStatusCode()
            .value());
    assertEquals(
        422,
        post(
                insufficientRecords,
                recordBody(
                    "CONTACT-REC-901",
                    "CONTACT-OTHER",
                    "2026-10",
                    "CUSTOMER-001",
                    "phone",
                    "2026-10-05T00:00:00Z"),
                "idem-mismatched-request")
            .getStatusCode()
            .value());
    assertEquals(5, rows("customer_contact_records"));
  }

  @Test
  void idempotencyAndRejectedRequestsKeepStoredFacts() throws Exception {
    ResponseEntity<String> created = post(AGREEMENTS, agreementBody(), "idem-replay-agreement");
    assertEquals(201, created.getStatusCode().value(), created.getBody());

    int agreementsBefore = rows("sales_performance_agreements");
    int idempotencyBefore = rows("sales_performance_idempotency");

    ResponseEntity<String> replay = post(AGREEMENTS, agreementBody(), "idem-replay-agreement");
    assertEquals(201, replay.getStatusCode().value(), replay.getBody());
    assertEquals(path(created), path(replay));
    assertEquals(agreementsBefore, rows("sales_performance_agreements"));
    assertEquals(idempotencyBefore, rows("sales_performance_idempotency"));

    Map<String, Object> conflicting =
        Map.of("agreement_id", AGREEMENT_ID, "signed_at", "2026-09-26T09:00:00Z");
    assertEquals(
        409, post(AGREEMENTS, conflicting, "idem-replay-agreement").getStatusCode().value());
    assertEquals(
        409, post(AGREEMENTS, agreementBody(), "idem-duplicate-agreement").getStatusCode().value());
    assertEquals(agreementsBefore, rows("sales_performance_agreements"));

    assertEquals(
        201,
        post(TARGETS, targetBody("CONTACT-2026-10", 3, 2, 1), "idem-record-target")
            .getStatusCode()
            .value());
    String records = TARGETS + "/CONTACT-2026-10/contact-records";
    int recordsBefore = rows("customer_contact_records");
    assertEquals(
        422,
        post(
                records,
                recordBody(
                    "CONTACT-REC-001",
                    "CONTACT-2026-10",
                    "2026-10",
                    "CUSTOMER-001",
                    "sms",
                    "2026-10-03T02:00:00Z"),
                "idem-invalid-channel")
            .getStatusCode()
            .value());
    Map<String, Object> missingField =
        new HashMap<>(
            recordBody(
                "CONTACT-REC-002",
                "CONTACT-2026-10",
                "2026-10",
                "CUSTOMER-002",
                "email",
                "2026-10-10T06:30:00Z"));
    missingField.remove("confirmed_at");
    assertEquals(422, post(records, missingField, "idem-missing-field").getStatusCode().value());
    assertEquals(recordsBefore, rows("customer_contact_records"));
    assertEquals(1, rows("monthly_customer_contact_targets"));
  }

  private boolean ruleCompleted(String requestId) {
    return agreements
        .findByIdentity(AGREEMENT_ID)
        .orElseThrow()
        .targets()
        .findByIdentity(requestId)
        .orElseThrow()
        .isCompleted();
  }

  private Map<String, Long> channelCounts(String requestId) {
    return agreements
        .findByIdentity(AGREEMENT_ID)
        .orElseThrow()
        .targets()
        .findByIdentity(requestId)
        .orElseThrow()
        .records()
        .findAll()
        .stream()
        .collect(
            Collectors.groupingBy(
                record -> record.getDescription().channel().value(), Collectors.counting()));
  }

  private int rows(String table) {
    return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
  }

  private String path(ResponseEntity<String> response) {
    return response.getHeaders().getLocation().getRawPath();
  }

  private JsonNode tree(ResponseEntity<String> response) throws Exception {
    return json.readTree(response.getBody());
  }

  private ResponseEntity<String> post(
      String path, Map<String, Object> body, String idempotencyKey) {
    HttpHeaders headers = new HttpHeaders();
    headers.set(HttpHeaders.ACCEPT, HAL_FORMS);
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("Idempotency-Key", idempotencyKey);
    return http.exchange(path, HttpMethod.POST, new HttpEntity<>(body, headers), String.class);
  }

  private static Map<String, Object> agreementBody() {
    return Map.of("agreement_id", AGREEMENT_ID, "signed_at", "2026-09-25T09:00:00Z");
  }

  private static Map<String, Object> targetBody(
      String requestId, int contactCount, int phoneCount, int emailCount) {
    return Map.ofEntries(
        Map.entry("request_id", requestId),
        Map.entry("agreement_id", AGREEMENT_ID),
        Map.entry("period_id", "2026-10"),
        Map.entry("started_at", "2026-10-01T00:00:00Z"),
        Map.entry("expired_at", "2026-10-31T23:59:59Z"),
        Map.entry("target_contact_count", contactCount),
        Map.entry("target_phone_count", phoneCount),
        Map.entry("target_email_count", emailCount),
        Map.entry("evidenceRefs", List.of("instance.sales-performance-agreement")));
  }

  private static Map<String, Object> recordBody(
      String recordId,
      String requestId,
      String periodId,
      String customerProfileId,
      String channel,
      String confirmedAt) {
    return Map.ofEntries(
        Map.entry("record_id", recordId),
        Map.entry("request_id", requestId),
        Map.entry("agreement_id", AGREEMENT_ID),
        Map.entry("period_id", periodId),
        Map.entry("customer_profile_id", customerProfileId),
        Map.entry("channel", channel),
        Map.entry("confirmed_at", confirmedAt),
        Map.entry("evidenceRefs", List.of("instance.monthly-customer-contact-request")));
  }
}
