package com.evidencepoc.backend.domain.model;

import com.evidencepoc.backend.domain.description.MonthlyCustomerContactTargetDescription;
import com.evidencepoc.backend.domain.description.SalesPerformanceAgreementDescription;
import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.HasMany;
import java.util.Objects;

/** contract.sales-performance: a reached agreement that owns its monthly targets. */
public final class SalesPerformanceAgreement
    implements Entity<String, SalesPerformanceAgreementDescription> {
  private final String identity;
  private final SalesPerformanceAgreementDescription description;
  private final Targets targets;

  public SalesPerformanceAgreement(
      String identity, SalesPerformanceAgreementDescription description, Targets targets) {
    if (identity == null || identity.isBlank()) {
      throw new IllegalArgumentException("Sales performance agreement identity must not be blank");
    }
    this.identity = identity;
    this.description = Objects.requireNonNull(description, "description");
    if (!identity.equals(description.agreementId())) {
      throw new IllegalArgumentException(
          "Sales performance agreement description must match its identity");
    }
    this.targets = Objects.requireNonNull(targets, "targets");
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public SalesPerformanceAgreementDescription getDescription() {
    return description;
  }

  /** Narrow read view of the owned monthly targets; appending goes through proposeTarget. */
  public HasMany<String, MonthlyCustomerContactTarget> targets() {
    return targets;
  }

  public MonthlyCustomerContactTarget proposeTarget(
      MonthlyCustomerContactTargetDescription targetDescription) {
    MonthlyCustomerContactTargetDescription target =
        Objects.requireNonNull(targetDescription, "targetDescription");
    if (!identity.equals(target.agreementId())) {
      throw new IllegalArgumentException(
          "Monthly target " + target.requestId() + " does not belong to agreement " + identity);
    }
    return targets.add(this, target);
  }

  /** Owner-private wide interface implemented by the persistence adapter. */
  public interface Targets extends HasMany<String, MonthlyCustomerContactTarget> {
    MonthlyCustomerContactTarget add(
        SalesPerformanceAgreement agreement, MonthlyCustomerContactTargetDescription description);
  }
}
