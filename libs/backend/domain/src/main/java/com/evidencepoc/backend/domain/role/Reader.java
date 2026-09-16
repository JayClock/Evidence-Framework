package com.evidencepoc.backend.domain.role;

import com.evidencepoc.backend.domain.description.SubscriptionDescription;
import com.evidencepoc.backend.domain.model.Subscription;
import com.evidencepoc.backend.domain.model.Subscriptions;
import com.evidencepoc.backend.domain.model.User;
import java.util.Objects;

/** role.reader: a User decorated with behavior available in context.subscription. */
public final class Reader {
  public static final String ROLE_ID = "role.reader";

  private final User actor;
  private final Subscriptions subscriptions;

  public Reader(User actor) {
    this(actor, null);
  }

  public Reader(User actor, Subscriptions subscriptions) {
    this.actor = Objects.requireNonNull(actor, "actor");
    this.subscriptions = subscriptions;
  }

  public User actor() {
    return actor;
  }

  public String roleId() {
    return ROLE_ID;
  }

  public String readerId() {
    return actor.getIdentity();
  }

  public Subscriptions subscriptions() {
    if (subscriptions == null) {
      throw new IllegalStateException("Subscriptions are not available in this context");
    }
    return subscriptions;
  }

  public Subscription registerSubscription(
      String subscriptionId, SubscriptionDescription description) {
    Objects.requireNonNull(description, "description");
    if (!readerId().equals(description.readerId())) {
      throw new IllegalArgumentException("A reader can only register their own subscription");
    }
    return subscriptions().register(subscriptionId, description);
  }
}
