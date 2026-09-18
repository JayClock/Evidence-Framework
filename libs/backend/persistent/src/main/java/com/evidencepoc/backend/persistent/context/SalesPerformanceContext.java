package com.evidencepoc.backend.persistent.context;

import com.evidencepoc.backend.domain.model.User;
import com.evidencepoc.backend.domain.role.PerformanceManager;
import com.evidencepoc.backend.domain.role.TeleSales;
import com.evidencepoc.backend.persistent.associations.SalesPerformanceAgreements;
import org.springframework.stereotype.Repository;

@Repository
public class SalesPerformanceContext
    implements com.evidencepoc.backend.domain.context.SalesPerformanceContext {
  private final SalesPerformanceAgreements agreements;

  public SalesPerformanceContext(SalesPerformanceAgreements agreements) {
    this.agreements = agreements;
  }

  @Override
  public PerformanceManager asPerformanceManager(User user) {
    if (user == null) {
      throw new IllegalArgumentException(
          "User is required to switch into role.performance-manager");
    }
    return new PerformanceManager(user);
  }

  @Override
  public TeleSales asTeleSales(User user) {
    if (user == null) {
      throw new IllegalArgumentException("User is required to switch into role.tele-sales");
    }
    return new TeleSales(user, agreements);
  }
}
