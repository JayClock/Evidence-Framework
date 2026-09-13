package com.evidencepoc.backend.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import jakarta.ws.rs.core.UriBuilder;
import jakarta.ws.rs.core.UriInfo;
import java.net.URI;
import org.junit.jupiter.api.Test;

class ApiTemplatesTests {
  private UriInfo uriInfo() {
    UriInfo info = mock(UriInfo.class);
    when(info.getBaseUriBuilder())
        .thenAnswer(invocation -> UriBuilder.fromUri("https://example.test/service/api/"));
    return info;
  }

  @Test
  void pageUriIsAbsoluteAndPreservesTheServletPrefix() {
    URI page = ApiTemplates.usersPage(uriInfo(), 2, 10);
    assertTrue(page.isAbsolute());
    assertEquals("https://example.test/service/api/users?page=2&size=10", page.toString());
    assertEquals("/service/api/users?page=2&size=10", ApiTemplates.relative(page));
  }

  @Test
  void memberUriEncodesIdentityWithoutLosingTheResourcePrefix() {
    URI user = ApiTemplates.user(uriInfo(), "user name");
    assertEquals("https://example.test/service/api/users/user%20name", user.toString());
    assertEquals("/service/api/users/user%20name", ApiTemplates.relative(user));
  }

  @Test
  void relativeLinksPreserveEncodingAndOmitTheFragment() {
    assertEquals(
        "/api/users/a%2Fb?q=a%20b",
        ApiTemplates.relative(URI.create("https://example.test/api/users/a%2Fb?q=a%20b#ignored")));
    assertEquals("/api/", ApiTemplates.relative(ApiTemplates.root(uriInfoForRoot())));
  }

  private UriInfo uriInfoForRoot() {
    UriInfo info = mock(UriInfo.class);
    when(info.getBaseUriBuilder())
        .thenAnswer(invocation -> UriBuilder.fromUri("https://example.test/api/"));
    return info;
  }
}
