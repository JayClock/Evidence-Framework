package com.evidencepoc.backend.domain.role;

import com.evidencepoc.backend.domain.model.User;
import java.util.Objects;

/** role.reader: a User decorated with behavior available in context.subscription. */
public final class Reader {
  public static final String ROLE_ID = "role.reader";

  private final User actor;

  public Reader(User actor) {
    this.actor = Objects.requireNonNull(actor, "actor");
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
}
