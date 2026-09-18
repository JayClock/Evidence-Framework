package com.evidencepoc.backend.persistent.mappers;

import com.evidencepoc.backend.domain.description.SalesPerformanceAgreementDescription;
import com.evidencepoc.backend.domain.model.SalesPerformanceAgreement;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface SalesPerformanceAgreementsMapper {
  SalesPerformanceAgreement findByIdentity(@Param("agreementId") String agreementId);

  List<SalesPerformanceAgreement> findPage(@Param("offset") int offset, @Param("limit") int limit);

  int count();

  int insert(@Param("description") SalesPerformanceAgreementDescription description);

  String findIdempotencyDigest(
      @Param("capability") String capability, @Param("idempotencyKey") String idempotencyKey);

  String findIdempotencyResourceId(
      @Param("capability") String capability, @Param("idempotencyKey") String idempotencyKey);

  int insertIdempotency(
      @Param("capability") String capability,
      @Param("idempotencyKey") String idempotencyKey,
      @Param("requestDigest") String requestDigest,
      @Param("resourceId") String resourceId);

  int countIdempotency();
}
