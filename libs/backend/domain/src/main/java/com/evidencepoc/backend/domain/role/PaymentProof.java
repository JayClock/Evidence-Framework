package com.evidencepoc.backend.domain.role;

import java.time.Instant;

public interface PaymentProof {
  String requestId();

  String subscriptionId();

  String readerId();

  String columnId();

  Instant confirmedAt();

  String paymentRequestId();

  long amountMinorUnits();

  String currency();

  String paymentId();

  boolean success();
}
