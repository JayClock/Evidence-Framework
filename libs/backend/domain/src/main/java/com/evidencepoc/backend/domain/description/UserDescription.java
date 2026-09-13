package com.evidencepoc.backend.domain.description;

import com.evidencepoc.backend.domain.InvalidUserDescriptionException;

public record UserDescription(String displayName) {
  public static final int MAX_DISPLAY_NAME_LENGTH = 100;

  public UserDescription {
    if (displayName == null
        || displayName.isBlank()
        || displayName.length() > MAX_DISPLAY_NAME_LENGTH) {
      throw new InvalidUserDescriptionException();
    }
  }
}
