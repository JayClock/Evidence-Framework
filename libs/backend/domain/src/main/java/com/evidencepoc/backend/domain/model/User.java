package com.evidencepoc.backend.domain.model;

import com.evidencepoc.backend.domain.description.UserDescription;
import io.github.jayclock.smartdomain.core.Entity;
import java.util.Objects;

public final class User implements Entity<String, UserDescription> {
  private String identity;
  private UserDescription description;

  // Required by smart-domain's leaf-entity hydration, not a public creation path.
  private User() {}

  public User(String identity, UserDescription description) {
    if (identity == null || identity.isBlank()) {
      throw new IllegalArgumentException("User identity must not be blank");
    }
    this.identity = identity;
    this.description = Objects.requireNonNull(description);
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public UserDescription getDescription() {
    return description;
  }

  public User renameTo(UserDescription description) {
    return new User(identity, description);
  }
}
