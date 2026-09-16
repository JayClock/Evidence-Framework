package com.evidencepoc.backend.domain.context;

import com.evidencepoc.backend.domain.model.User;
import com.evidencepoc.backend.domain.role.Reader;

/** context.subscription: pure context interface for switching a User into subscription roles. */
public interface SubscriptionContext {
  Reader asReader(User user);
}
