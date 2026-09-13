package com.evidencepoc.backend.api;

import jakarta.ws.rs.core.UriBuilder;
import jakarta.ws.rs.core.UriInfo;
import java.net.URI;

public final class ApiTemplates {
  private ApiTemplates() {}

  public static URI root(UriInfo uriInfo) {
    return uriInfo.getBaseUriBuilder().path(RootApi.class).build();
  }

  public static URI users(UriInfo uriInfo) {
    return uriInfo.getBaseUriBuilder().path(RootApi.class).path(RootApi.class, "users").build();
  }

  public static URI user(UriInfo uriInfo, String userId) {
    return uriInfo
        .getBaseUriBuilder()
        .path(RootApi.class)
        .path(RootApi.class, "users")
        .path(UsersApi.class, "findById")
        .build(userId);
  }

  public static URI usersPage(UriInfo uriInfo, int page, int size) {
    return UriBuilder.fromUri(users(uriInfo))
        .queryParam("page", page)
        .queryParam("size", size)
        .build();
  }

  public static String relative(URI uri) {
    return uri.getRawPath() + (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery());
  }
}
