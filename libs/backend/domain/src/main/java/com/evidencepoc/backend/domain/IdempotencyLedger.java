package com.evidencepoc.backend.domain;

import java.util.Optional;

/**
 * In-process idempotency contract shared by the HTTP and persistence modules: the HTTP layer passes
 * the capability, the caller-supplied key and a request digest, while the owning adapter stores
 * them next to the registered resource.
 */
public interface IdempotencyLedger {
  /**
   * Returns the recorded resource id when the same capability, key and digest were already
   * processed. An empty result means the key is unused.
   *
   * @throws IdempotencyKeyReuseException when the key was used with a different digest
   */
  Optional<String> replayedResourceId(
      String capability, String idempotencyKey, String requestDigest);

  void rememberResult(
      String capability, String idempotencyKey, String requestDigest, String resourceId);
}
