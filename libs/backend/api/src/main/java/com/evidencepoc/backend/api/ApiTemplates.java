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

  public static URI salesPerformanceAgreements(UriInfo uriInfo) {
    return uriInfo
        .getBaseUriBuilder()
        .path(RootApi.class)
        .path(RootApi.class, "salesPerformanceAgreements")
        .build();
  }

  public static URI salesPerformanceAgreement(UriInfo uriInfo, String agreementId) {
    return UriBuilder.fromUri(salesPerformanceAgreements(uriInfo))
        .path(SalesPerformanceAgreementsApi.class, "findById")
        .build(agreementId);
  }

  public static URI monthlyCustomerContactTargets(UriInfo uriInfo, String agreementId) {
    return UriBuilder.fromUri(salesPerformanceAgreement(uriInfo, agreementId))
        .path(SalesPerformanceAgreementApi.class, "targets")
        .build();
  }

  public static URI monthlyCustomerContactTarget(
      UriInfo uriInfo, String agreementId, String targetId) {
    return UriBuilder.fromUri(monthlyCustomerContactTargets(uriInfo, agreementId))
        .path(MonthlyCustomerContactTargetsApi.class, "findById")
        .build(targetId);
  }

  public static URI customerContactRecords(UriInfo uriInfo, String agreementId, String targetId) {
    return UriBuilder.fromUri(monthlyCustomerContactTarget(uriInfo, agreementId, targetId))
        .path(MonthlyCustomerContactTargetApi.class, "records")
        .build();
  }

  public static URI customerContactRecord(
      UriInfo uriInfo, String agreementId, String targetId, String recordId) {
    return UriBuilder.fromUri(customerContactRecords(uriInfo, agreementId, targetId))
        .path(recordId)
        .build();
  }

  public static String relative(URI uri) {
    return uri.getRawPath() + (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery());
  }
}
