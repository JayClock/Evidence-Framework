package com.evidencepoc.backend.domain;

public final class IdempotencyKeyReuseException extends RuntimeException {
  public IdempotencyKeyReuseException(String idempotencyKey) {
    super("Idempotency key was already used with a different payload: " + idempotencyKey);
  }
}
