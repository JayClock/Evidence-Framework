package com.evidencepoc.backend.domain.model;

import com.evidencepoc.backend.domain.PaymentRequestNotFoundException;
import com.evidencepoc.backend.domain.description.SubscriptionDescription;
import io.github.jayclock.smartdomain.core.Entity;
import java.util.Objects;

public final class Subscription implements Entity<String, SubscriptionDescription> {
  private final String identity;
  private final SubscriptionDescription description;
  private PaymentRequest paymentRequest;

  public Subscription(String identity, SubscriptionDescription description) {
    if (identity == null || identity.isBlank()) {
      throw new IllegalArgumentException("Subscription identity must not be blank");
    }
    this.identity = identity;
    this.description = Objects.requireNonNull(description, "description");
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public SubscriptionDescription getDescription() {
    return description;
  }

  public synchronized PaymentRequest startPayment(String requestId) {
    if (paymentRequest == null) {
      paymentRequest = PaymentRequest.from(requestId, this);
    } else if (!paymentRequest.requestId().equals(requestId)) {
      throw new IllegalStateException("A payment request already exists for " + identity);
    }
    return paymentRequest;
  }

  public synchronized PaymentRequest paymentRequest() {
    if (paymentRequest == null) {
      throw new PaymentRequestNotFoundException(identity);
    }
    return paymentRequest;
  }
}
