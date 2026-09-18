package com.evidencepoc.backend.api;

import com.evidencepoc.backend.domain.IdempotencyKeyReuseException;
import com.evidencepoc.backend.domain.SalesPerformanceAgreementNotFoundException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

public final class SalesPerformanceExceptionMappers {
  private SalesPerformanceExceptionMappers() {}

  private static Response error(int status, String code, String message) {
    return Response.status(status)
        .type(MediaType.APPLICATION_JSON)
        .header("Cache-Control", "no-store")
        .entity(new UserExceptionMappers.ErrorBody(code, message))
        .build();
  }

  @Provider
  public static class AgreementNotFound
      implements ExceptionMapper<SalesPerformanceAgreementNotFoundException> {
    @Override
    public Response toResponse(SalesPerformanceAgreementNotFoundException exception) {
      return error(404, "SALES_PERFORMANCE_AGREEMENT_NOT_FOUND", exception.getMessage());
    }
  }

  @Provider
  public static class InvalidInput implements ExceptionMapper<IllegalArgumentException> {
    @Override
    public Response toResponse(IllegalArgumentException exception) {
      return error(422, "INVALID_SALES_PERFORMANCE_INPUT", exception.getMessage());
    }
  }

  @Provider
  public static class Conflict implements ExceptionMapper<IllegalStateException> {
    @Override
    public Response toResponse(IllegalStateException exception) {
      return error(409, "SALES_PERFORMANCE_CONFLICT", exception.getMessage());
    }
  }

  @Provider
  public static class IdempotencyReuse implements ExceptionMapper<IdempotencyKeyReuseException> {
    @Override
    public Response toResponse(IdempotencyKeyReuseException exception) {
      return error(409, "IDEMPOTENCY_KEY_REUSE", exception.getMessage());
    }
  }
}
