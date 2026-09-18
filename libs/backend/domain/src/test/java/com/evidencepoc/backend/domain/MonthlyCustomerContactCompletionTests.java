package com.evidencepoc.backend.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.evidencepoc.backend.domain.description.CustomerContactRecordDescription;
import com.evidencepoc.backend.domain.description.MonthlyCustomerContactTargetDescription;
import com.evidencepoc.backend.domain.model.ContactChannel;
import com.evidencepoc.backend.domain.model.CustomerContactRecord;
import com.evidencepoc.backend.domain.model.MonthlyCustomerContactTarget;
import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.Many;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class MonthlyCustomerContactCompletionTests {
  private static final String AGREEMENT_ID = "PERF-2026-Q4-001";
  private static final String TARGET_ID = "CONTACT-2026-10";
  private static final String PERIOD_ID = "2026-10";

  @Test
  void followsTheCompletedScenarioFromInsufficientToCompleted() {
    MonthlyCustomerContactTarget target = target(new InMemoryRecords(), 3, 2, 1);

    assertFalse(target.isCompleted());
    target.registerContactRecord(phoneContact1());
    assertFalse(target.isCompleted());
    target.registerContactRecord(emailContact1());
    assertFalse(target.isCompleted());
    target.registerContactRecord(phoneContact2());
    assertTrue(target.isCompleted());
  }

  @Test
  void countsRecordsAtBothClosedPeriodEnds() {
    MonthlyCustomerContactTarget startTarget = target(new InMemoryRecords(), 1, 1, 0);
    startTarget.registerContactRecord(phoneAt("2026-10-01T00:00:00Z"));
    assertTrue(startTarget.isCompleted());

    MonthlyCustomerContactTarget endTarget = target(new InMemoryRecords(), 1, 1, 0);
    endTarget.registerContactRecord(phoneAt("2026-10-31T23:59:59Z"));
    assertTrue(endTarget.isCompleted());
  }

  @Test
  void excludesRecordsOutsideTheClosedPeriod() {
    MonthlyCustomerContactTarget beforeTarget = target(new InMemoryRecords(), 1, 1, 0);
    beforeTarget.registerContactRecord(phoneAt("2026-09-30T23:59:59Z"));
    assertFalse(beforeTarget.isCompleted());

    MonthlyCustomerContactTarget afterTarget = target(new InMemoryRecords(), 1, 1, 0);
    afterTarget.registerContactRecord(phoneAt("2026-11-01T00:00:00Z"));
    assertFalse(afterTarget.isCompleted());
  }

  @Test
  void excludesStoredRecordsThatDoNotMatchTheTarget() {
    InMemoryRecords records = new InMemoryRecords();
    MonthlyCustomerContactTarget target = target(records, 1, 1, 0);

    records.add(
        target,
        record(
            "CONTACT-REC-901",
            TARGET_ID,
            AGREEMENT_ID,
            "2026-11",
            "CUSTOMER-001",
            ContactChannel.PHONE,
            Instant.parse("2026-10-05T00:00:00Z")));
    records.add(
        target,
        record(
            "CONTACT-REC-902",
            TARGET_ID,
            "PERF-OTHER",
            PERIOD_ID,
            "CUSTOMER-001",
            ContactChannel.PHONE,
            Instant.parse("2026-10-05T00:00:00Z")));
    records.add(
        target,
        record(
            "CONTACT-REC-903",
            "CONTACT-OTHER",
            AGREEMENT_ID,
            PERIOD_ID,
            "CUSTOMER-001",
            ContactChannel.PHONE,
            Instant.parse("2026-10-05T00:00:00Z")));

    assertEquals(3, records.findAll().size());
    assertFalse(target.isCompleted());
  }

  @Test
  void staysIncompleteWhenTheTotalIsReachedButPhoneCountFallsShort() {
    MonthlyCustomerContactTarget target = target(new InMemoryRecords(), 3, 2, 1);

    target.registerContactRecord(phoneContact1());
    target.registerContactRecord(emailContact1());
    // 合成补充记录：来源未提供第四条实例，仅用于“总数达标但电话数不足”的反例。
    target.registerContactRecord(
        record(
            "CONTACT-REC-004",
            TARGET_ID,
            AGREEMENT_ID,
            PERIOD_ID,
            "CUSTOMER-002",
            ContactChannel.EMAIL,
            Instant.parse("2026-10-15T00:00:00Z")));

    assertFalse(target.isCompleted());
  }

  private static MonthlyCustomerContactTarget target(
      InMemoryRecords records, int contactCount, int phoneCount, int emailCount) {
    return new MonthlyCustomerContactTarget(
        TARGET_ID,
        new MonthlyCustomerContactTargetDescription(
            TARGET_ID,
            AGREEMENT_ID,
            PERIOD_ID,
            Instant.parse("2026-10-01T00:00:00Z"),
            Instant.parse("2026-10-31T23:59:59Z"),
            contactCount,
            phoneCount,
            emailCount),
        records);
  }

  private static CustomerContactRecordDescription phoneAt(String confirmedAt) {
    return record(
        "CONTACT-REC-001",
        TARGET_ID,
        AGREEMENT_ID,
        PERIOD_ID,
        "CUSTOMER-001",
        ContactChannel.PHONE,
        Instant.parse(confirmedAt));
  }

  private static CustomerContactRecordDescription phoneContact1() {
    return record(
        "CONTACT-REC-001",
        TARGET_ID,
        AGREEMENT_ID,
        PERIOD_ID,
        "CUSTOMER-001",
        ContactChannel.PHONE,
        Instant.parse("2026-10-03T02:00:00Z"));
  }

  private static CustomerContactRecordDescription emailContact1() {
    return record(
        "CONTACT-REC-002",
        TARGET_ID,
        AGREEMENT_ID,
        PERIOD_ID,
        "CUSTOMER-002",
        ContactChannel.EMAIL,
        Instant.parse("2026-10-10T06:30:00Z"));
  }

  private static CustomerContactRecordDescription phoneContact2() {
    return record(
        "CONTACT-REC-003",
        TARGET_ID,
        AGREEMENT_ID,
        PERIOD_ID,
        "CUSTOMER-003",
        ContactChannel.PHONE,
        Instant.parse("2026-10-28T08:15:00Z"));
  }

  private static CustomerContactRecordDescription record(
      String recordId,
      String requestId,
      String agreementId,
      String periodId,
      String customerProfileId,
      ContactChannel channel,
      Instant confirmedAt) {
    return new CustomerContactRecordDescription(
        recordId, requestId, agreementId, periodId, customerProfileId, channel, confirmedAt);
  }

  private static final class InMemoryRecords implements MonthlyCustomerContactTarget.Records {
    private final LinkedHashMap<String, CustomerContactRecord> records = new LinkedHashMap<>();

    @Override
    public CustomerContactRecord add(
        MonthlyCustomerContactTarget target, CustomerContactRecordDescription description) {
      CustomerContactRecord record = new CustomerContactRecord(description.recordId(), description);
      if (records.containsKey(description.recordId())) {
        throw new IllegalStateException(
            "Customer contact record already exists: " + description.recordId());
      }
      records.put(description.recordId(), record);
      return record;
    }

    @Override
    public Many<CustomerContactRecord> findAll() {
      return new ListMany<>(new ArrayList<>(records.values()));
    }

    @Override
    public Optional<CustomerContactRecord> findByIdentity(String identifier) {
      return Optional.ofNullable(records.get(identifier));
    }
  }

  private record ListMany<E extends Entity<?, ?>>(List<E> values) implements Many<E> {
    @Override
    public int size() {
      return values.size();
    }

    @Override
    public Many<E> subCollection(int from, int to) {
      return new ListMany<>(List.copyOf(values.subList(from, to)));
    }

    @Override
    public Iterator<E> iterator() {
      return values.iterator();
    }
  }
}
