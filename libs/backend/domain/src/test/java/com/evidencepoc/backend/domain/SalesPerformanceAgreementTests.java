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
import com.evidencepoc.backend.domain.role.TeleSales;
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

class SalesPerformanceAgreementTests {
  private static final String AGREEMENT_ID = "PERF-2026-Q4-001";
  private static final Instant SIGNED_AT = Instant.parse("2026-09-25T09:00:00Z");

  @Test
  void registersAgreementThroughTheTeleSalesRoleAndLocatesItByIdentity() {
    InMemorySalesPerformanceAgreements agreements = new InMemorySalesPerformanceAgreements();
    TeleSales teleSales = new TeleSales(user("TS-001"), agreements);

    SalesPerformanceAgreement registered =
        teleSales.registerAgreement(
            new SalesPerformanceAgreementDescription(AGREEMENT_ID, SIGNED_AT));

    assertEquals(AGREEMENT_ID, registered.getIdentity());
    assertEquals(AGREEMENT_ID, registered.getDescription().agreementId());
    assertEquals(SIGNED_AT, registered.getDescription().signedAt());
    assertSame(registered, agreements.findByIdentity(AGREEMENT_ID).orElseThrow());
    assertEquals(1, agreements.findAll().size());
    assertEquals(0, registered.targets().findAll().size());
  }

  @Test
  void rejectsInvalidAgreementFactsWithoutReplacingTheRegisteredOne() {
    InMemorySalesPerformanceAgreements agreements = new InMemorySalesPerformanceAgreements();
    SalesPerformanceAgreement original =
        agreements.register(new SalesPerformanceAgreementDescription(AGREEMENT_ID, SIGNED_AT));

    assertThrows(
        IllegalArgumentException.class,
        () -> new SalesPerformanceAgreementDescription(null, SIGNED_AT));
    assertThrows(
        IllegalArgumentException.class,
        () -> new SalesPerformanceAgreementDescription(" ", SIGNED_AT));
    assertThrows(
        IllegalArgumentException.class,
        () -> new SalesPerformanceAgreementDescription(AGREEMENT_ID, null));
    assertThrows(NullPointerException.class, () -> agreements.register(null));
    assertThrows(
        IllegalStateException.class,
        () ->
            agreements.register(
                new SalesPerformanceAgreementDescription(AGREEMENT_ID, SIGNED_AT.plusSeconds(1))));

    assertEquals(1, agreements.findAll().size());
    assertSame(original, agreements.findByIdentity(AGREEMENT_ID).orElseThrow());
    assertEquals(SIGNED_AT, original.getDescription().signedAt());
  }

  @Test
  void refusesAgreementEntitiesWhoseDescriptionOrAssociationDoesNotMatch() {
    SalesPerformanceAgreementDescription description =
        new SalesPerformanceAgreementDescription(AGREEMENT_ID, SIGNED_AT);

    assertThrows(
        IllegalArgumentException.class,
        () -> new SalesPerformanceAgreement("PERF-OTHER", description, new InMemoryTargets()));
    assertThrows(
        IllegalArgumentException.class,
        () -> new SalesPerformanceAgreement(" ", description, new InMemoryTargets()));
    assertThrows(
        NullPointerException.class,
        () -> new SalesPerformanceAgreement(AGREEMENT_ID, description, null));
  }

  private static User user(String id) {
    return new User(id, new UserDescription("角色成员"));
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
