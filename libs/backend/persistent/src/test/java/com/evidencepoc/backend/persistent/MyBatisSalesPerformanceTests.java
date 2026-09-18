package com.evidencepoc.backend.persistent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.evidencepoc.backend.domain.context.SalesPerformanceContext;
import com.evidencepoc.backend.domain.description.CustomerContactRecordDescription;
import com.evidencepoc.backend.domain.description.MonthlyCustomerContactTargetDescription;
import com.evidencepoc.backend.domain.description.SalesPerformanceAgreementDescription;
import com.evidencepoc.backend.domain.description.UserDescription;
import com.evidencepoc.backend.domain.model.ContactChannel;
import com.evidencepoc.backend.domain.model.MonthlyCustomerContactTarget;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreement;
import com.evidencepoc.backend.domain.model.User;
import com.evidencepoc.backend.domain.role.TeleSales;
import com.evidencepoc.backend.persistent.associations.CustomerContactRecords;
import com.evidencepoc.backend.persistent.associations.SalesPerformanceAgreements;
import com.evidencepoc.backend.persistent.mappers.MonthlyCustomerContactTargetsMapper;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(
    classes = MyBatisSalesPerformanceTests.TestApplication.class,
    webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
class MyBatisSalesPerformanceTests {
  @Configuration(proxyBeanMethods = false)
  @EnableAutoConfiguration
  @ComponentScan("com.evidencepoc.backend.persistent")
  static class TestApplication {}

  @Autowired SalesPerformanceAgreements agreements;
  @Autowired SalesPerformanceContext context;
  @Autowired MonthlyCustomerContactTargetsMapper targetsMapper;
  @Autowired JdbcTemplate jdbc;
  @Autowired PlatformTransactionManager transactionManager;

  @BeforeEach
  void clearFacts() {
    jdbc.update("DELETE FROM customer_contact_records");
    jdbc.update("DELETE FROM monthly_customer_contact_targets");
    jdbc.update("DELETE FROM sales_performance_agreements");
    jdbc.update("DELETE FROM sales_performance_idempotency");
  }

  @Test
  void roundTripsAgreementsTargetsAndRecords() {
    TeleSales teleSales = context.asTeleSales(new User("TS-001", new UserDescription("电话销售")));

    SalesPerformanceAgreement agreement = teleSales.registerAgreement(agreementDescription());
    MonthlyCustomerContactTarget october = agreement.proposeTarget(octoberTarget());
    agreement.proposeTarget(novemberTarget());
    october.registerContactRecord(phone1());
    october.registerContactRecord(email1());
    october.registerContactRecord(phone2());

    SalesPerformanceAgreement reloaded =
        agreements.findByIdentity("PERF-2026-Q4-001").orElseThrow();
    assertEquals("PERF-2026-Q4-001", reloaded.getIdentity());
    assertEquals(Instant.parse("2026-09-25T09:00:00Z"), reloaded.getDescription().signedAt());
    assertEquals(2, reloaded.targets().findAll().size());

    MonthlyCustomerContactTarget reloadedTarget =
        reloaded.targets().findByIdentity("CONTACT-2026-10").orElseThrow();
    assertEquals("2026-10", reloadedTarget.getDescription().periodId());
    assertEquals(
        Instant.parse("2026-10-01T00:00:00Z"), reloadedTarget.getDescription().startedAt());
    assertEquals(
        Instant.parse("2026-10-31T23:59:59Z"), reloadedTarget.getDescription().expiredAt());
    assertEquals(3, reloadedTarget.getDescription().targetContactCount());
    assertEquals(2, reloadedTarget.getDescription().targetPhoneCount());
    assertEquals(1, reloadedTarget.getDescription().targetEmailCount());

    assertEquals(3, reloadedTarget.records().findAll().size());
    assertEquals(
        List.of(ContactChannel.PHONE, ContactChannel.EMAIL, ContactChannel.PHONE),
        reloadedTarget.records().findAll().stream()
            .map(record -> record.getDescription().channel())
            .toList());
    assertTrue(reloadedTarget.isCompleted());

    assertEquals(1, rowCount("sales_performance_agreements"));
    assertEquals(2, rowCount("monthly_customer_contact_targets"));
    assertEquals(3, rowCount("customer_contact_records"));
    assertTrue(agreements.findByIdentity("PERF-MISSING").isEmpty());
  }

  @Test
  void enforcesUniquenessIdempotencyAndRollback() {
    SalesPerformanceAgreement agreement = agreements.register(agreementDescription());
    MonthlyCustomerContactTarget target = agreement.proposeTarget(octoberTarget());
    target.registerContactRecord(phone1());

    assertThrows(
        DataIntegrityViolationException.class, () -> agreements.register(agreementDescription()));
    assertThrows(
        DataIntegrityViolationException.class, () -> agreement.proposeTarget(octoberTarget()));
    assertThrows(
        DataIntegrityViolationException.class, () -> target.registerContactRecord(phone1()));

    String capability = "capability.register-customer-contact-record-tele-sales";
    agreements.rememberResult(
        capability, "idem-contact-rec-001", "digest-001", "CONTACT-REC-001-playback");
    assertEquals(
        Optional.of("CONTACT-REC-001-playback"),
        agreements.replayedResourceId(capability, "idem-contact-rec-001", "digest-001"));
    assertThrows(
        IllegalStateException.class,
        () -> agreements.replayedResourceId(capability, "idem-contact-rec-001", "digest-002"));
    assertEquals(
        Optional.empty(), agreements.replayedResourceId(capability, "idem-unused", "digest-any"));

    CustomerContactRecords orphanRecords =
        new CustomerContactRecords(targetsMapper, "CONTACT-MISSING");
    MonthlyCustomerContactTarget orphanTarget =
        new MonthlyCustomerContactTarget(
            "CONTACT-MISSING", missingTargetDescription(), orphanRecords);
    int recordsBefore = rowCount("customer_contact_records");
    assertThrows(
        DataIntegrityViolationException.class,
        () -> orphanTarget.registerContactRecord(orphanRecord()));
    assertEquals(recordsBefore, rowCount("customer_contact_records"));

    int agreementsBefore = rowCount("sales_performance_agreements");
    int idempotencyBefore = rowCount("sales_performance_idempotency");
    TransactionTemplate transaction = new TransactionTemplate(transactionManager);
    assertThrows(
        IllegalStateException.class,
        () ->
            transaction.executeWithoutResult(
                status -> {
                  agreements.register(
                      new SalesPerformanceAgreementDescription(
                          "PERF-ROLLBACK", Instant.parse("2026-09-25T09:00:00Z")));
                  agreements.rememberResult(
                      "capability.register-sales-performance-agreement-tele-sales",
                      "idem-rollback",
                      "digest-rollback",
                      "PERF-ROLLBACK");
                  throw new IllegalStateException("force rollback");
                }));

    assertEquals(agreementsBefore, rowCount("sales_performance_agreements"));
    assertEquals(idempotencyBefore, rowCount("sales_performance_idempotency"));
    assertEquals(1, rowCount("monthly_customer_contact_targets"));
    assertEquals(recordsBefore, rowCount("customer_contact_records"));
  }

  private int rowCount(String table) {
    return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
  }

  private static SalesPerformanceAgreementDescription agreementDescription() {
    return new SalesPerformanceAgreementDescription(
        "PERF-2026-Q4-001", Instant.parse("2026-09-25T09:00:00Z"));
  }

  private static MonthlyCustomerContactTargetDescription octoberTarget() {
    return new MonthlyCustomerContactTargetDescription(
        "CONTACT-2026-10",
        "PERF-2026-Q4-001",
        "2026-10",
        Instant.parse("2026-10-01T00:00:00Z"),
        Instant.parse("2026-10-31T23:59:59Z"),
        3,
        2,
        1);
  }

  private static MonthlyCustomerContactTargetDescription novemberTarget() {
    return new MonthlyCustomerContactTargetDescription(
        "CONTACT-2026-11",
        "PERF-2026-Q4-001",
        "2026-11",
        Instant.parse("2026-11-01T00:00:00Z"),
        Instant.parse("2026-11-30T23:59:59Z"),
        3,
        2,
        1);
  }

  private static MonthlyCustomerContactTargetDescription missingTargetDescription() {
    return new MonthlyCustomerContactTargetDescription(
        "CONTACT-MISSING",
        "PERF-2026-Q4-001",
        "2026-12",
        Instant.parse("2026-12-01T00:00:00Z"),
        Instant.parse("2026-12-31T23:59:59Z"),
        1,
        1,
        0);
  }

  private static CustomerContactRecordDescription phone1() {
    return record(
        "CONTACT-REC-001",
        "CUSTOMER-001",
        ContactChannel.PHONE,
        Instant.parse("2026-10-03T02:00:00Z"));
  }

  private static CustomerContactRecordDescription email1() {
    return record(
        "CONTACT-REC-002",
        "CUSTOMER-002",
        ContactChannel.EMAIL,
        Instant.parse("2026-10-10T06:30:00Z"));
  }

  private static CustomerContactRecordDescription phone2() {
    return record(
        "CONTACT-REC-003",
        "CUSTOMER-003",
        ContactChannel.PHONE,
        Instant.parse("2026-10-28T08:15:00Z"));
  }

  private static CustomerContactRecordDescription orphanRecord() {
    return new CustomerContactRecordDescription(
        "CONTACT-REC-900",
        "CONTACT-MISSING",
        "PERF-2026-Q4-001",
        "2026-12",
        "CUSTOMER-001",
        ContactChannel.PHONE,
        Instant.parse("2026-12-05T00:00:00Z"));
  }

  private static CustomerContactRecordDescription record(
      String recordId, String customerProfileId, ContactChannel channel, Instant confirmedAt) {
    return new CustomerContactRecordDescription(
        recordId,
        "CONTACT-2026-10",
        "PERF-2026-Q4-001",
        "2026-10",
        customerProfileId,
        channel,
        confirmedAt);
  }
}
