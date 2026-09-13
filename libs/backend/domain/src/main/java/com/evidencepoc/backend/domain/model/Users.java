package com.evidencepoc.backend.domain.model;

import com.evidencepoc.backend.domain.description.UserDescription;
import io.github.jayclock.smartdomain.core.HasMany;

/** Root association for user identity and its local lifecycle. Not an authorization API. */
public interface Users extends HasMany<String, User> {
  User create(UserDescription description);

  User update(String identity, UserDescription description);

  void delete(String identity);
}
