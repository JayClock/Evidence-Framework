package com.evidencepoc.backend.domain.role;

import com.evidencepoc.backend.domain.description.MonthlyCustomerContactTargetDescription;
import com.evidencepoc.backend.domain.model.MonthlyCustomerContactTarget;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreement;
import com.evidencepoc.backend.domain.model.User;
import java.util.Objects;

/** role.performance-manager: a User decorated with sales-performance behavior. */
public final class PerformanceManager {
  public static final String ROLE_ID = "role.performance-manager";

  private final User actor;

  public PerformanceManager(User actor) {
    this.actor = Objects.requireNonNull(actor, "actor");
  }

  public User actor() {
    return actor;
  }

  public String roleId() {
    return ROLE_ID;
  }

  public String managerId() {
    return actor.getIdentity();
  }

  public MonthlyCustomerContactTarget proposeMonthlyTarget(
      SalesPerformanceAgreement agreement, MonthlyCustomerContactTargetDescription description) {
    Objects.requireNonNull(agreement, "agreement");
    Objects.requireNonNull(description, "description");
    return agreement.proposeTarget(description);
  }
}
