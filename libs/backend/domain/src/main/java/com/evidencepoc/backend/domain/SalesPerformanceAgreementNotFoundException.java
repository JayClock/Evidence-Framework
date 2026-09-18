package com.evidencepoc.backend.domain;

public final class SalesPerformanceAgreementNotFoundException extends RuntimeException {
  public SalesPerformanceAgreementNotFoundException(String agreementId) {
    super("Sales performance agreement not found: " + agreementId);
  }
}
