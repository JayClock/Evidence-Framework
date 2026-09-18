package com.evidencepoc.backend.domain.model;

import com.evidencepoc.backend.domain.description.CustomerContactRecordDescription;
import com.evidencepoc.backend.domain.description.MonthlyCustomerContactTargetDescription;
import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.HasMany;
import java.util.Objects;

/** request.monthly-customer-contact: one business-period target under an agreement. */
public final class MonthlyCustomerContactTarget
    implements Entity<String, MonthlyCustomerContactTargetDescription> {
  private final String identity;
  private final MonthlyCustomerContactTargetDescription description;
  private final Records records;

  public MonthlyCustomerContactTarget(
      String identity, MonthlyCustomerContactTargetDescription description) {
    this(identity, description, null);
  }

  public MonthlyCustomerContactTarget(
      String identity, MonthlyCustomerContactTargetDescription description, Records records) {
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
    this.records = records;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public MonthlyCustomerContactTargetDescription getDescription() {
    return description;
  }

  /**
   * Narrow read view of the owned contact records; appending goes through registerContactRecord.
   */
  public HasMany<String, CustomerContactRecord> records() {
    return wideRecords();
  }

  private Records wideRecords() {
    if (records == null) {
      throw new IllegalStateException("Contact records are not available in this context");
    }
    return records;
  }

  public CustomerContactRecord registerContactRecord(
      CustomerContactRecordDescription recordDescription) {
    CustomerContactRecordDescription record =
        Objects.requireNonNull(recordDescription, "recordDescription");
    if (!identity.equals(record.requestId())
        || !description.agreementId().equals(record.agreementId())
        || !description.periodId().equals(record.periodId())) {
      throw new IllegalArgumentException(
          "Contact record " + record.recordId() + " does not belong to target " + identity);
    }
    return wideRecords().add(this, record);
  }

  /**
   * rule.monthly-customer-contact-completed: counts stored records that match this target inside
   * the closed business period and compares total, phone and email counts with the agreed targets.
   */
  public boolean isCompleted() {
    int total = 0;
    int phone = 0;
    int email = 0;
    for (CustomerContactRecord record : wideRecords().findAll()) {
      if (!isCounted(record)) {
        continue;
      }
      total++;
      ContactChannel channel = record.getDescription().channel();
      if (channel == ContactChannel.PHONE) {
        phone++;
      } else if (channel == ContactChannel.EMAIL) {
        email++;
      }
    }
    return total >= description.targetContactCount()
        && phone >= description.targetPhoneCount()
        && email >= description.targetEmailCount();
  }

  private boolean isCounted(CustomerContactRecord record) {
    CustomerContactRecordDescription recordDescription = record.getDescription();
    return identity.equals(recordDescription.requestId())
        && description.agreementId().equals(recordDescription.agreementId())
        && description.periodId().equals(recordDescription.periodId())
        && !recordDescription.confirmedAt().isBefore(description.startedAt())
        && !recordDescription.confirmedAt().isAfter(description.expiredAt());
  }

  /** Owner-private wide interface implemented by the persistence adapter. */
  public interface Records extends HasMany<String, CustomerContactRecord> {
    CustomerContactRecord add(
        MonthlyCustomerContactTarget target, CustomerContactRecordDescription description);
  }
}
