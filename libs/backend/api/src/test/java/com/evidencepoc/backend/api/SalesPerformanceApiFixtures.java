package com.evidencepoc.backend.api;

import com.evidencepoc.backend.domain.description.CustomerContactRecordDescription;
import com.evidencepoc.backend.domain.description.MonthlyCustomerContactTargetDescription;
import com.evidencepoc.backend.domain.description.SalesPerformanceAgreementDescription;
import com.evidencepoc.backend.domain.model.CustomerContactRecord;
import com.evidencepoc.backend.domain.model.MonthlyCustomerContactTarget;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreement;
import io.github.jayclock.smartdomain.core.Many;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Optional;

/** API fixtures: real entities and descriptions with small in-memory associations. */
final class SalesPerformanceApiFixtures {
  static final String AGREEMENT_ID = "PERF-2026-Q4-001";
  static final String TARGET_ID = "CONTACT-2026-10";
  static final String PERIOD_ID = "2026-10";
  static final Instant SIGNED_AT = Instant.parse("2026-09-25T09:00:00Z");

  private SalesPerformanceApiFixtures() {}

  static SalesPerformanceAgreement agreement() {
    return agreement(new InMemoryTargets());
  }

  static SalesPerformanceAgreement agreement(InMemoryTargets targets) {
    return new SalesPerformanceAgreement(
        AGREEMENT_ID, new SalesPerformanceAgreementDescription(AGREEMENT_ID, SIGNED_AT), targets);
  }

  static MonthlyCustomerContactTarget target() {
    return target(new InMemoryRecords());
  }

  static MonthlyCustomerContactTarget target(InMemoryRecords records) {
    return new MonthlyCustomerContactTarget(TARGET_ID, targetDescription(), records);
  }

  static MonthlyCustomerContactTargetDescription targetDescription() {
    return new MonthlyCustomerContactTargetDescription(
        TARGET_ID,
        AGREEMENT_ID,
        PERIOD_ID,
        Instant.parse("2026-10-01T00:00:00Z"),
        Instant.parse("2026-10-31T23:59:59Z"),
        3,
        2,
        1);
  }

  static final class InMemoryTargets implements SalesPerformanceAgreement.Targets {
    private final LinkedHashMap<String, MonthlyCustomerContactTarget> targets =
        new LinkedHashMap<>();

    void seed(MonthlyCustomerContactTarget target) {
      targets.put(target.getIdentity(), target);
    }

    @Override
    public MonthlyCustomerContactTarget add(
        SalesPerformanceAgreement agreement, MonthlyCustomerContactTargetDescription description) {
      if (targets.containsKey(description.requestId())) {
        throw new IllegalStateException(
            "Monthly customer contact target already exists: " + description.requestId());
      }
      MonthlyCustomerContactTarget target =
          new MonthlyCustomerContactTarget(
              description.requestId(), description, new InMemoryRecords());
      targets.put(target.getIdentity(), target);
      return target;
    }

    @Override
    public Many<MonthlyCustomerContactTarget> findAll() {
      return new TestMany<>(new ArrayList<>(targets.values()));
    }

    @Override
    public Optional<MonthlyCustomerContactTarget> findByIdentity(String identifier) {
      return Optional.ofNullable(targets.get(identifier));
    }
  }

  static final class InMemoryRecords implements MonthlyCustomerContactTarget.Records {
    private final LinkedHashMap<String, CustomerContactRecord> records = new LinkedHashMap<>();

    void seed(CustomerContactRecord record) {
      records.put(record.getIdentity(), record);
    }

    @Override
    public CustomerContactRecord add(
        MonthlyCustomerContactTarget target, CustomerContactRecordDescription description) {
      if (records.containsKey(description.recordId())) {
        throw new IllegalStateException(
            "Customer contact record already exists: " + description.recordId());
      }
      CustomerContactRecord record = new CustomerContactRecord(description.recordId(), description);
      records.put(record.getIdentity(), record);
      return record;
    }

    @Override
    public Many<CustomerContactRecord> findAll() {
      return new TestMany<>(new ArrayList<>(records.values()));
    }

    @Override
    public Optional<CustomerContactRecord> findByIdentity(String identifier) {
      return Optional.ofNullable(records.get(identifier));
    }
  }
}
