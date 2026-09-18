package com.evidencepoc.backend.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.evidencepoc.backend.domain.description.MonthlyCustomerContactTargetDescription;
import com.evidencepoc.backend.domain.description.SalesPerformanceAgreementDescription;
import com.evidencepoc.backend.domain.description.UserDescription;
import com.evidencepoc.backend.domain.model.MonthlyCustomerContactTarget;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreement;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreements;
import com.evidencepoc.backend.domain.model.User;
import com.evidencepoc.backend.domain.role.PerformanceManager;
import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.Many;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class MonthlyCustomerContactTargetTests {
  private static final String AGREEMENT_ID = "PERF-2026-Q4-001";
  private static final Instant SIGNED_AT = Instant.parse("2026-09-25T09:00:00Z");

  @Test
  void proposesTargetsUnderAnAgreementAndKeepsMultipleBusinessPeriods() {
    InMemorySalesPerformanceAgreements agreements = new InMemorySalesPerformanceAgreements();
    SalesPerformanceAgreement agreement = agreements.register(agreementDescription());
    PerformanceManager manager = new PerformanceManager(user("PM-001"));

    MonthlyCustomerContactTarget october = manager.proposeMonthlyTarget(agreement, octoberTarget());
    MonthlyCustomerContactTarget november =
        manager.proposeMonthlyTarget(agreement, novemberTarget());

    assertEquals("CONTACT-2026-10", october.getIdentity());
    assertEquals(AGREEMENT_ID, october.getDescription().agreementId());
    assertEquals("2026-10", october.getDescription().periodId());
    assertEquals(Instant.parse("2026-10-01T00:00:00Z"), october.getDescription().startedAt());
    assertEquals(Instant.parse("2026-10-31T23:59:59Z"), october.getDescription().expiredAt());
    assertEquals(3, october.getDescription().targetContactCount());
    assertEquals(2, october.getDescription().targetPhoneCount());
    assertEquals(1, october.getDescription().targetEmailCount());
    assertEquals("CONTACT-2026-11", november.getIdentity());
    assertEquals("2026-11", november.getDescription().periodId());
    assertEquals(2, agreement.targets().findAll().size());
    assertSame(october, agreement.targets().findByIdentity("CONTACT-2026-10").orElseThrow());
    assertSame(november, agreement.targets().findByIdentity("CONTACT-2026-11").orElseThrow());
    assertEquals(1, agreements.findAll().size());
  }

  @Test
  void rejectsInvalidTargetsWithoutChangingRegisteredFacts() {
    InMemorySalesPerformanceAgreements agreements = new InMemorySalesPerformanceAgreements();
    SalesPerformanceAgreement agreement = agreements.register(agreementDescription());
    PerformanceManager manager = new PerformanceManager(user("PM-001"));

    assertThrows(NullPointerException.class, () -> agreements.register(null));
    assertThrows(
        IllegalArgumentException.class,
        () -> new SalesPerformanceAgreementDescription(" ", SIGNED_AT));
    assertThrows(
        IllegalArgumentException.class,
        () -> new SalesPerformanceAgreementDescription(AGREEMENT_ID, null));
    assertThrows(IllegalStateException.class, () -> agreements.register(agreementDescription()));

    assertThrows(NullPointerException.class, () -> manager.proposeMonthlyTarget(agreement, null));
    assertThrows(
        NullPointerException.class, () -> manager.proposeMonthlyTarget(null, octoberTarget()));

    assertThrows(
        IllegalArgumentException.class,
        () ->
            targetDescription(" ", AGREEMENT_ID, "2026-10", octoberStart(), octoberEnd(), 3, 2, 1));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            targetDescription(
                "CONTACT-2026-10", " ", "2026-10", octoberStart(), octoberEnd(), 3, 2, 1));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            targetDescription(
                "CONTACT-2026-10", AGREEMENT_ID, " ", octoberStart(), octoberEnd(), 3, 2, 1));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            targetDescription(
                "CONTACT-2026-10", AGREEMENT_ID, "2026-10", null, octoberEnd(), 3, 2, 1));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            targetDescription(
                "CONTACT-2026-10", AGREEMENT_ID, "2026-10", octoberStart(), null, 3, 2, 1));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            targetDescription(
                "CONTACT-2026-10", AGREEMENT_ID, "2026-10", octoberEnd(), octoberStart(), 3, 2, 1));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            targetDescription(
                "CONTACT-2026-10",
                AGREEMENT_ID,
                "2026-10",
                octoberStart(),
                octoberEnd(),
                -1,
                2,
                1));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            targetDescription(
                "CONTACT-2026-10",
                AGREEMENT_ID,
                "2026-10",
                octoberStart(),
                octoberEnd(),
                3,
                -1,
                1));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            targetDescription(
                "CONTACT-2026-10",
                AGREEMENT_ID,
                "2026-10",
                octoberStart(),
                octoberEnd(),
                3,
                2,
                -1));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            manager.proposeMonthlyTarget(
                agreement,
                targetDescription(
                    "CONTACT-2026-10",
                    "PERF-OTHER",
                    "2026-10",
                    octoberStart(),
                    octoberEnd(),
                    3,
                    2,
                    1)));
    assertThrows(
        IllegalArgumentException.class,
        () -> new MonthlyCustomerContactTarget("CONTACT-OTHER", octoberTarget()));

    assertEquals(1, agreements.findAll().size());
    assertEquals(0, agreement.targets().findAll().size());
  }

  private static User user(String id) {
    return new User(id, new UserDescription("角色成员"));
  }

  private static SalesPerformanceAgreementDescription agreementDescription() {
    return new SalesPerformanceAgreementDescription(AGREEMENT_ID, SIGNED_AT);
  }

  private static Instant octoberStart() {
    return Instant.parse("2026-10-01T00:00:00Z");
  }

  private static Instant octoberEnd() {
    return Instant.parse("2026-10-31T23:59:59Z");
  }

  private static MonthlyCustomerContactTargetDescription octoberTarget() {
    return targetDescription(
        "CONTACT-2026-10", AGREEMENT_ID, "2026-10", octoberStart(), octoberEnd(), 3, 2, 1);
  }

  private static MonthlyCustomerContactTargetDescription novemberTarget() {
    return targetDescription(
        "CONTACT-2026-11",
        AGREEMENT_ID,
        "2026-11",
        Instant.parse("2026-11-01T00:00:00Z"),
        Instant.parse("2026-11-30T23:59:59Z"),
        3,
        2,
        1);
  }

  private static MonthlyCustomerContactTargetDescription targetDescription(
      String requestId,
      String agreementId,
      String periodId,
      Instant startedAt,
      Instant expiredAt,
      int contactCount,
      int phoneCount,
      int emailCount) {
    return new MonthlyCustomerContactTargetDescription(
        requestId,
        agreementId,
        periodId,
        startedAt,
        expiredAt,
        contactCount,
        phoneCount,
        emailCount);
  }

  private static final class InMemorySalesPerformanceAgreements
      implements SalesPerformanceAgreements {
    private final LinkedHashMap<String, SalesPerformanceAgreement> agreements =
        new LinkedHashMap<>();

    @Override
    public SalesPerformanceAgreement register(SalesPerformanceAgreementDescription description) {
      Objects.requireNonNull(description, "description");
      if (agreements.containsKey(description.agreementId())) {
        throw new IllegalStateException(
            "Sales performance agreement already exists: " + description.agreementId());
      }
      SalesPerformanceAgreement agreement =
          new SalesPerformanceAgreement(
              description.agreementId(), description, new InMemoryTargets());
      agreements.put(description.agreementId(), agreement);
      return agreement;
    }

    @Override
    public Many<SalesPerformanceAgreement> findAll() {
      return new ListMany<>(new ArrayList<>(agreements.values()));
    }

    @Override
    public Optional<SalesPerformanceAgreement> findByIdentity(String identifier) {
      return Optional.ofNullable(agreements.get(identifier));
    }
  }

  private static final class InMemoryTargets implements SalesPerformanceAgreement.Targets {
    private final LinkedHashMap<String, MonthlyCustomerContactTarget> targets =
        new LinkedHashMap<>();

    @Override
    public MonthlyCustomerContactTarget add(
        SalesPerformanceAgreement agreement, MonthlyCustomerContactTargetDescription description) {
      MonthlyCustomerContactTarget target =
          new MonthlyCustomerContactTarget(description.requestId(), description);
      if (targets.containsKey(description.requestId())) {
        throw new IllegalStateException(
            "Monthly target already exists: " + description.requestId());
      }
      targets.put(description.requestId(), target);
      return target;
    }

    @Override
    public Many<MonthlyCustomerContactTarget> findAll() {
      return new ListMany<>(new ArrayList<>(targets.values()));
    }

    @Override
    public Optional<MonthlyCustomerContactTarget> findByIdentity(String identifier) {
      return Optional.ofNullable(targets.get(identifier));
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
