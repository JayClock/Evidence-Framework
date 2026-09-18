package com.evidencepoc.backend.domain.role;

import com.evidencepoc.backend.domain.description.CustomerContactRecordDescription;
import com.evidencepoc.backend.domain.description.SalesPerformanceAgreementDescription;
import com.evidencepoc.backend.domain.model.CustomerContactRecord;
import com.evidencepoc.backend.domain.model.MonthlyCustomerContactTarget;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreement;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreements;
import com.evidencepoc.backend.domain.model.User;
import java.util.Objects;

/** role.tele-sales: a User decorated with sales-performance behavior. */
public final class TeleSales {
  public static final String ROLE_ID = "role.tele-sales";

  private final User actor;
  private final SalesPerformanceAgreements agreements;

  public TeleSales(User actor) {
    this(actor, null);
  }

  public TeleSales(User actor, SalesPerformanceAgreements agreements) {
    this.actor = Objects.requireNonNull(actor, "actor");
    this.agreements = agreements;
  }

  public User actor() {
    return actor;
  }

  public String roleId() {
    return ROLE_ID;
  }

  public String teleSalesId() {
    return actor.getIdentity();
  }

  public SalesPerformanceAgreement registerAgreement(
      SalesPerformanceAgreementDescription description) {
    Objects.requireNonNull(description, "description");
    return agreements().register(description);
  }

  public CustomerContactRecord registerContactRecord(
      MonthlyCustomerContactTarget target, CustomerContactRecordDescription description) {
    Objects.requireNonNull(target, "target");
    Objects.requireNonNull(description, "description");
    return target.registerContactRecord(description);
  }

  private SalesPerformanceAgreements agreements() {
    if (agreements == null) {
      throw new IllegalStateException(
          "Sales performance agreements are not available in this context");
    }
    return agreements;
  }
}
