package com.evidencepoc.backend.persistent.associations;

import com.evidencepoc.backend.domain.description.CustomerContactRecordDescription;
import com.evidencepoc.backend.domain.model.CustomerContactRecord;
import com.evidencepoc.backend.domain.model.MonthlyCustomerContactTarget;
import com.evidencepoc.backend.persistent.mappers.MonthlyCustomerContactTargetsMapper;
import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import io.github.jayclock.smartdomain.mybatis.database.EntityList;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;

/** Adapter for the contact records owned by one monthly customer contact target. */
@AssociationMapping(
    entity = MonthlyCustomerContactTarget.class,
    field = "records",
    parentIdField = "requestId")
public class CustomerContactRecords extends EntityList<String, CustomerContactRecord>
    implements MonthlyCustomerContactTarget.Records {
  private String requestId;

  @Autowired private MonthlyCustomerContactTargetsMapper mapper;

  public CustomerContactRecords() {}

  public CustomerContactRecords(MonthlyCustomerContactTargetsMapper mapper, String requestId) {
    this.mapper = mapper;
    this.requestId = requestId;
  }

  @Override
  public CustomerContactRecord add(
      MonthlyCustomerContactTarget target, CustomerContactRecordDescription description) {
    if (mapper.insertRecord(description) != 1) {
      throw new IllegalStateException("Customer contact record insert did not affect one row");
    }
    return mapper.findRecordByIdentityInTarget(description.recordId(), target.getIdentity());
  }

  @Override
  protected List<CustomerContactRecord> findEntities(int from, int to) {
    if (from < 0 || to < from) {
      throw new IllegalArgumentException("Invalid collection range");
    }
    return mapper.findRecordsByTarget(requestId, from, to - from);
  }

  @Override
  protected CustomerContactRecord findEntity(String id) {
    return mapper.findRecordByIdentityInTarget(id, requestId);
  }

  @Override
  public int size() {
    return mapper.countRecordsByTarget(requestId);
  }
}
