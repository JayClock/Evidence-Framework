package com.evidencepoc.backend.api;

import com.evidencepoc.backend.domain.InvalidUserDescriptionException;
import com.evidencepoc.backend.domain.UserNotFoundException;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

public final class UserExceptionMappers {
  private UserExceptionMappers() {}

  public record ErrorBody(String code, String message) {}

  private static Response error(int status, String code, String message) {
    return Response.status(status)
        .type(MediaType.APPLICATION_JSON)
        .entity(new ErrorBody(code, message))
        .build();
  }

  @Provider
  public static class NotFound implements ExceptionMapper<UserNotFoundException> {
    @Override
    public Response toResponse(UserNotFoundException exception) {
      return error(404, "USER_NOT_FOUND", exception.getMessage());
    }
  }

  @Provider
  public static class InvalidDescription
      implements ExceptionMapper<InvalidUserDescriptionException> {
    @Override
    public Response toResponse(InvalidUserDescriptionException exception) {
      return error(400, "INVALID_DISPLAY_NAME", exception.getMessage());
    }
  }

  @Provider
  public static class BadRequest implements ExceptionMapper<BadRequestException> {
    @Override
    public Response toResponse(BadRequestException exception) {
      return error(400, "BAD_REQUEST", "Invalid request");
    }
  }
}
