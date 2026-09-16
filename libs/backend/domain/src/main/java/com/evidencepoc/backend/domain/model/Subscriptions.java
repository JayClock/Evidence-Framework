package com.evidencepoc.backend.domain.model;

import com.evidencepoc.backend.domain.description.SubscriptionDescription;
import io.github.jayclock.smartdomain.core.HasMany;

public interface Subscriptions extends HasMany<String, Subscription> {
  Subscription register(String identity, SubscriptionDescription description);
}
