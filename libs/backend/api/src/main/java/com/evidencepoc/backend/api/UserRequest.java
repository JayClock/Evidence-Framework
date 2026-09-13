package com.evidencepoc.backend.api;

import com.evidencepoc.backend.domain.InvalidUserDescriptionException;
import com.evidencepoc.backend.domain.description.UserDescription;
import jakarta.validation.constraints.NotBlank;
import org.hibernate.validator.constraints.Length;
import org.springframework.hateoas.InputType;

/** A writable transport bean: immutable records are exposed as read-only by HATEOAS 2.5. */
public final class UserRequest {
  @NotBlank
  @Length(max = UserDescription.MAX_DISPLAY_NAME_LENGTH)
  @InputType("text")
  private String displayName;

  public UserRequest() {}

  public String getDisplayName() {
    return displayName;
  }

  public void setDisplayName(String displayName) {
    this.displayName = displayName;
  }

  public static UserDescription description(UserRequest input) {
    if (input == null) {
      throw new InvalidUserDescriptionException();
    }
    return new UserDescription(input.displayName);
  }
}
