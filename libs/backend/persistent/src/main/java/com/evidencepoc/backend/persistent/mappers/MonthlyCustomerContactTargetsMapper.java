package com.evidencepoc.backend.persistent.mappers;

import com.evidencepoc.backend.domain.description.CustomerContactRecordDescription;
import com.evidencepoc.backend.domain.description.MonthlyCustomerContactTargetDescription;
import com.evidencepoc.backend.domain.model.CustomerContactRecord;
import com.evidencepoc.backend.domain.model.MonthlyCustomerContactTarget;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface MonthlyCustomerContactTargetsMapper {
  MonthlyCustomerContactTarget findByIdentity(@Param("requestId") String requestId);

  MonthlyCustomerContactTarget findByIdentityInAgreement(
      @Param("requestId") String requestId, @Param("agreementId") String agreementId);

  List<MonthlyCustomerContactTarget> findByAgreementId(
      @Param("agreementId") String agreementId,
      @Param("offset") int offset,
      @Param("limit") int limit);

  int countByAgreementId(@Param("agreementId") String agreementId);

  int insert(
      @Param("agreementId") String agreementId,
      @Param("description") MonthlyCustomerContactTargetDescription description);

  CustomerContactRecord findRecordByIdentity(@Param("recordId") String recordId);

  CustomerContactRecord findRecordByIdentityInTarget(
      @Param("recordId") String recordId, @Param("requestId") String requestId);

  List<CustomerContactRecord> findRecordsByTarget(
      @Param("requestId") String requestId, @Param("offset") int offset, @Param("limit") int limit);

  int countRecordsByTarget(@Param("requestId") String requestId);

  int insertRecord(@Param("description") CustomerContactRecordDescription description);
}
