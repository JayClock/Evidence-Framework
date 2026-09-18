package com.evidencepoc.backend.domain.model;

import com.evidencepoc.backend.domain.description.MonthlyCustomerContactTargetDescription;
import io.github.jayclock.smartdomain.core.Entity;
import java.util.Objects;

/** request.monthly-customer-contact: one business-period target under an agreement. */
public final class MonthlyCustomerContactTarget
    implements Entity<String, MonthlyCustomerContactTargetDescription> {
  private final String identity;
  private final MonthlyCustomerContactTargetDescription description;

  public MonthlyCustomerContactTarget(
      String identity, MonthlyCustomerContactTargetDescription description) {
    if (identity == null || identity.isBlank()) {
      throw new IllegalArgumentException(
          "Monthly customer contact target identity must not be blank");
    }
    this.identity = identity;
    this.description = Objects.requireNonNull(description, "description");
    if (!identity.equals(description.requestId())) {
      throw new IllegalArgumentException(
          "Monthly customer contact target description must match its identity");
    }
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public MonthlyCustomerContactTargetDescription getDescription() {
    return description;
  }
}
