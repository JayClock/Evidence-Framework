package com.evidencepoc.backend.domain;

public final class PaymentRequestNotFoundException extends RuntimeException {
  public PaymentRequestNotFoundException(String subscriptionId) {
    super("Payment request not found for subscription " + subscriptionId);
  }
}
