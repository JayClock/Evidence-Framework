package com.evidencepoc.backend.domain.role;

import com.evidencepoc.backend.domain.model.User;
import java.util.Objects;

/** role.tele-sales: a User decorated with sales-performance behavior. */
public final class TeleSales {
  public static final String ROLE_ID = "role.tele-sales";

  private final User actor;

  public TeleSales(User actor) {
    this.actor = Objects.requireNonNull(actor, "actor");
  }

  public User actor() {
    return actor;
  }

  public String roleId() {
    return ROLE_ID;
  }

  public String teleSalesId() {
    return actor.getIdentity();
  }
}
