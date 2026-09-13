package com.evidencepoc.backend.domain;

public final class UserNotFoundException extends RuntimeException {
  public UserNotFoundException() {
    super("User not found");
  }
}
