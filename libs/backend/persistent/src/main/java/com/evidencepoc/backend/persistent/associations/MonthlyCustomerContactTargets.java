package com.evidencepoc.backend.persistent.associations;

import com.evidencepoc.backend.domain.description.MonthlyCustomerContactTargetDescription;
import com.evidencepoc.backend.domain.model.MonthlyCustomerContactTarget;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreement;
import com.evidencepoc.backend.persistent.mappers.MonthlyCustomerContactTargetsMapper;
import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import io.github.jayclock.smartdomain.mybatis.database.EntityList;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;

/** Adapter for the monthly targets owned by one sales performance agreement. */
@AssociationMapping(
    entity = SalesPerformanceAgreement.class,
    field = "targets",
    parentIdField = "agreementId")
public class MonthlyCustomerContactTargets extends EntityList<String, MonthlyCustomerContactTarget>
    implements SalesPerformanceAgreement.Targets {
  private String agreementId;

  @Autowired private MonthlyCustomerContactTargetsMapper mapper;

  public MonthlyCustomerContactTargets() {}

  public MonthlyCustomerContactTargets(
      MonthlyCustomerContactTargetsMapper mapper, String agreementId) {
    this.mapper = mapper;
    this.agreementId = agreementId;
  }

  @Override
  public MonthlyCustomerContactTarget add(
      SalesPerformanceAgreement agreement, MonthlyCustomerContactTargetDescription description) {
    if (mapper.insert(agreement.getIdentity(), description) != 1) {
      throw new IllegalStateException("Monthly target insert did not affect one row");
    }
    return mapper.findByIdentityInAgreement(description.requestId(), agreement.getIdentity());
  }

  @Override
  protected List<MonthlyCustomerContactTarget> findEntities(int from, int to) {
    if (from < 0 || to < from) {
      throw new IllegalArgumentException("Invalid collection range");
    }
    return mapper.findByAgreementId(agreementId, from, to - from);
  }

  @Override
  protected MonthlyCustomerContactTarget findEntity(String id) {
    return mapper.findByIdentityInAgreement(id, agreementId);
  }

  @Override
  public int size() {
    return mapper.countByAgreementId(agreementId);
  }
}
