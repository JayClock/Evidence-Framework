package com.evidencepoc.backend.persistent.context;

import com.evidencepoc.backend.domain.model.User;
import com.evidencepoc.backend.domain.role.Reader;
import org.springframework.stereotype.Repository;

@Repository
public class SubscriptionContext
    implements com.evidencepoc.backend.domain.context.SubscriptionContext {
  @Override
  public Reader asReader(User user) {
    if (user == null) {
      throw new IllegalArgumentException("User is required to switch into role.reader");
    }
    return new Reader(user);
  }
}
