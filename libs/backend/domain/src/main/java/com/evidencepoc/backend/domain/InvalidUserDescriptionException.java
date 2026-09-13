package com.evidencepoc.backend.domain;

public final class InvalidUserDescriptionException extends RuntimeException {
  public InvalidUserDescriptionException() {
    super("displayName must be non-blank and at most 100 characters");
  }
}
