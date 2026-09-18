package com.evidencepoc.backend.domain.model;

import com.evidencepoc.backend.domain.description.CustomerContactRecordDescription;
import io.github.jayclock.smartdomain.core.Entity;
import java.util.Objects;

/** confirmation.customer-contact-record: one customer contact completed by tele-sales. */
public final class CustomerContactRecord
    implements Entity<String, CustomerContactRecordDescription> {
  private final String identity;
  private final CustomerContactRecordDescription description;

  public CustomerContactRecord(String identity, CustomerContactRecordDescription description) {
    if (identity == null || identity.isBlank()) {
      throw new IllegalArgumentException("Customer contact record identity must not be blank");
    }
    this.identity = identity;
    this.description = Objects.requireNonNull(description, "description");
    if (!identity.equals(description.recordId())) {
      throw new IllegalArgumentException(
          "Customer contact record description must match its identity");
    }
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public CustomerContactRecordDescription getDescription() {
    return description;
  }
}
