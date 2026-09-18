package com.evidencepoc.backend.domain.context;

import com.evidencepoc.backend.domain.model.User;
import com.evidencepoc.backend.domain.role.PerformanceManager;
import com.evidencepoc.backend.domain.role.TeleSales;

/** context.sales-performance: pure context interface for switching a User into sales roles. */
public interface SalesPerformanceContext {
  PerformanceManager asPerformanceManager(User user);

  TeleSales asTeleSales(User user);
}
