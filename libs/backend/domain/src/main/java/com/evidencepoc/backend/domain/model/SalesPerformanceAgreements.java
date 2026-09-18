package com.evidencepoc.backend.domain.model;

import com.evidencepoc.backend.domain.description.SalesPerformanceAgreementDescription;
import io.github.jayclock.smartdomain.core.HasMany;

/** Root association for sales performance agreements reached by manager and tele-sales. */
public interface SalesPerformanceAgreements extends HasMany<String, SalesPerformanceAgreement> {
  SalesPerformanceAgreement register(SalesPerformanceAgreementDescription description);
}
