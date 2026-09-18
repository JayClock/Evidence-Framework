package com.evidencepoc.backend.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.evidencepoc.backend.domain.description.CustomerContactRecordDescription;
import com.evidencepoc.backend.domain.description.MonthlyCustomerContactTargetDescription;
import com.evidencepoc.backend.domain.description.UserDescription;
import com.evidencepoc.backend.domain.model.ContactChannel;
import com.evidencepoc.backend.domain.model.CustomerContactRecord;
import com.evidencepoc.backend.domain.model.MonthlyCustomerContactTarget;
import com.evidencepoc.backend.domain.model.User;
import com.evidencepoc.backend.domain.role.TeleSales;
import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.Many;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class CustomerContactRecordTests {
  private static final String AGREEMENT_ID = "PERF-2026-Q4-001";
  private static final String TARGET_ID = "CONTACT-2026-10";
  private static final String PERIOD_ID = "2026-10";

  @Test
  void appendsFmInstancesAndRejectsInvalidOrMismatchedRecordsWithoutChangingTheCollection() {
    InMemoryRecords records = new InMemoryRecords();
    MonthlyCustomerContactTarget target = target(records, 3, 2, 1);
    TeleSales teleSales = new TeleSales(user("TS-001"));

    CustomerContactRecord phone1 = teleSales.registerContactRecord(target, phoneContact1());

    assertEquals("CONTACT-REC-001", phone1.getIdentity());
    assertEquals("CONTACT-REC-001", phone1.getDescription().recordId());
    assertEquals(TARGET_ID, phone1.getDescription().requestId());
    assertEquals(AGREEMENT_ID, phone1.getDescription().agreementId());
    assertEquals(PERIOD_ID, phone1.getDescription().periodId());
    assertEquals("CUSTOMER-001", phone1.getDescription().customerProfileId());
    assertEquals(ContactChannel.PHONE, phone1.getDescription().channel());
    assertEquals(Instant.parse("2026-10-03T02:00:00Z"), phone1.getDescription().confirmedAt());
    assertEquals(1, target.records().findAll().size());

    teleSales.registerContactRecord(target, emailContact1());
    teleSales.registerContactRecord(target, phoneContact2());
    assertEquals(3, target.records().findAll().size());

    // 周期外但匹配的记录允许保存，由完成规则排除。
    teleSales.registerContactRecord(
        target,
        record(
            "CONTACT-REC-004",
            TARGET_ID,
            AGREEMENT_ID,
            PERIOD_ID,
            "CUSTOMER-003",
            ContactChannel.PHONE,
            Instant.parse("2026-11-01T00:00:00Z")));
    assertEquals(4, target.records().findAll().size());

    assertThrows(NullPointerException.class, () -> teleSales.registerContactRecord(target, null));
    assertThrows(
        NullPointerException.class, () -> teleSales.registerContactRecord(null, phoneContact1()));
    assertThrows(IllegalStateException.class, () -> target.registerContactRecord(phoneContact1()));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            target.registerContactRecord(
                record(
                    "CONTACT-REC-900",
                    "CONTACT-OTHER",
                    AGREEMENT_ID,
                    PERIOD_ID,
                    "CUSTOMER-001",
                    ContactChannel.PHONE,
                    Instant.parse("2026-10-05T00:00:00Z"))));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            target.registerContactRecord(
                record(
                    "CONTACT-REC-901",
                    TARGET_ID,
                    "PERF-OTHER",
                    PERIOD_ID,
                    "CUSTOMER-001",
                    ContactChannel.PHONE,
                    Instant.parse("2026-10-05T00:00:00Z"))));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            target.registerContactRecord(
                record(
                    "CONTACT-REC-902",
                    TARGET_ID,
                    AGREEMENT_ID,
                    "2026-11",
                    "CUSTOMER-001",
                    ContactChannel.PHONE,
                    Instant.parse("2026-10-05T00:00:00Z"))));

    assertThrows(
        IllegalArgumentException.class,
        () ->
            record(
                " ",
                TARGET_ID,
                AGREEMENT_ID,
                PERIOD_ID,
                "CUSTOMER-001",
                ContactChannel.PHONE,
                Instant.parse("2026-10-05T00:00:00Z")));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            record(
                "CONTACT-REC-903",
                " ",
                AGREEMENT_ID,
                PERIOD_ID,
                "CUSTOMER-001",
                ContactChannel.PHONE,
                Instant.parse("2026-10-05T00:00:00Z")));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            record(
                "CONTACT-REC-904",
                TARGET_ID,
                AGREEMENT_ID,
                PERIOD_ID,
                " ",
                ContactChannel.PHONE,
                Instant.parse("2026-10-05T00:00:00Z")));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            record(
                "CONTACT-REC-905",
                TARGET_ID,
                AGREEMENT_ID,
                PERIOD_ID,
                "CUSTOMER-001",
                null,
                Instant.parse("2026-10-05T00:00:00Z")));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            record(
                "CONTACT-REC-906",
                TARGET_ID,
                AGREEMENT_ID,
                PERIOD_ID,
                "CUSTOMER-001",
                ContactChannel.PHONE,
                null));
    assertThrows(IllegalArgumentException.class, () -> ContactChannel.fromValue("sms"));
    assertThrows(
        IllegalArgumentException.class,
        () -> new CustomerContactRecord("CONTACT-OTHER", phoneContact1()));

    assertEquals(4, target.records().findAll().size());
  }

  @Test
  void refusesRecordEntitiesWhoseDescriptionDoesNotMatchTheirIdentity() {
    assertThrows(
        IllegalArgumentException.class, () -> new CustomerContactRecord(" ", phoneContact1()));
    assertThrows(
        NullPointerException.class, () -> new CustomerContactRecord("CONTACT-REC-001", null));
  }

  private static User user(String id) {
    return new User(id, new UserDescription("角色成员"));
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
