package com.evidencepoc.backend.persistent.associations;

import com.evidencepoc.backend.domain.description.SalesPerformanceAgreementDescription;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreement;
import com.evidencepoc.backend.persistent.mappers.SalesPerformanceAgreementsMapper;
import io.github.jayclock.smartdomain.core.Many;
import io.github.jayclock.smartdomain.mybatis.database.EntityList;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Root association adapter; owns the sales performance write entries and idempotency ledger. */
@Repository
public class SalesPerformanceAgreements
    implements com.evidencepoc.backend.domain.model.SalesPerformanceAgreements {
  private final SalesPerformanceAgreementsMapper mapper;

  public SalesPerformanceAgreements(SalesPerformanceAgreementsMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  public Optional<SalesPerformanceAgreement> findByIdentity(String identifier) {
    return Optional.ofNullable(mapper.findByIdentity(identifier));
  }

  @Override
  public Many<SalesPerformanceAgreement> findAll() {
    return new AgreementCollection(mapper);
  }

  @Override
  @Transactional
  public SalesPerformanceAgreement register(SalesPerformanceAgreementDescription description) {
    if (mapper.insert(description) != 1) {
      throw new IllegalStateException("Sales performance agreement insert did not affect one row");
    }
    return findByIdentity(description.agreementId())
        .orElseThrow(() -> new IllegalStateException("Registered agreement cannot be reloaded"));
  }

  /**
   * Returns the recorded resource id when the same capability, idempotency key and request digest
   * were already processed. An empty result means the key is unused; a different digest for a used
   * key is a conflict.
   */
  public Optional<String> replayedResourceId(
      String capability, String idempotencyKey, String requestDigest) {
    String recordedDigest = mapper.findIdempotencyDigest(capability, idempotencyKey);
    if (recordedDigest == null) {
      return Optional.empty();
    }
    if (!recordedDigest.equals(requestDigest)) {
      throw new IllegalStateException(
          "Idempotency key was already used with a different payload: " + idempotencyKey);
    }
    return Optional.ofNullable(mapper.findIdempotencyResourceId(capability, idempotencyKey));
  }

  @Transactional
  public void rememberResult(
      String capability, String idempotencyKey, String requestDigest, String resourceId) {
    if (mapper.insertIdempotency(capability, idempotencyKey, requestDigest, resourceId) != 1) {
      throw new IllegalStateException("Idempotency record insert did not affect one row");
    }
  }

  // The collection is not an AOP bean; EntityList's final methods stay outside Spring proxies.
  private static final class AgreementCollection
      extends EntityList<String, SalesPerformanceAgreement> {
    private final SalesPerformanceAgreementsMapper mapper;

    private AgreementCollection(SalesPerformanceAgreementsMapper mapper) {
      this.mapper = mapper;
    }

    @Override
    protected List<SalesPerformanceAgreement> findEntities(int from, int to) {
      if (from < 0 || to < from) {
        throw new IllegalArgumentException("Invalid collection range");
      }
      return mapper.findPage(from, to - from);
    }

    @Override
    protected SalesPerformanceAgreement findEntity(String id) {
      return mapper.findByIdentity(id);
    }

    @Override
    public int size() {
      return mapper.count();
    }
  }
}
