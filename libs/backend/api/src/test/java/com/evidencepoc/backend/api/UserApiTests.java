package com.evidencepoc.backend.api;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.evidencepoc.backend.domain.UserNotFoundException;
import com.evidencepoc.backend.domain.description.UserDescription;
import com.evidencepoc.backend.domain.model.User;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class UserApiTests extends ApiTest {
  @ParameterizedTest
  @ValueSource(
      strings = {"application/json", "application/hal+json", "application/prs.hal-forms+json"})
  void getUsesTheLoadedEntityAndNegotiatesSupportedMedia(String mediaType) {
    when(users.findByIdentity("user-1")).thenReturn(Optional.of(user("user-1", "小明")));
    api()
        .accept(mediaType)
        .get("/api/users/user-1")
        .then()
        .statusCode(200)
        .contentType(startsWith(mediaType))
        .body("id", is("user-1"))
        .body("displayName", is("小明"))
        .body("_links.self.href", is("/api/users/user-1"));
    verify(users).findByIdentity("user-1");
    verifyNoMoreInteractions(users);
  }

  @ParameterizedTest
  @ValueSource(strings = {"GET", "PUT", "DELETE"})
  void missingMemberReturns404WithoutCallingAnyMutation(String method) {
    when(users.findByIdentity("missing")).thenReturn(Optional.empty());
    var request = api();
    if (method.equals("PUT")) {
      request.contentType("application/json").body(Map.of("displayName", "A"));
    }
    request
        .request(method, "/api/users/missing")
        .then()
        .statusCode(404)
        .body("code", is("USER_NOT_FOUND"));
    verify(users).findByIdentity("missing");
    verifyNoMoreInteractions(users);
  }

  @Test
  void updateDelegatesStableIdentityAndTheNewDescription() {
    User original = user("user-1", "Before");
    when(users.findByIdentity("user-1")).thenReturn(Optional.of(original));
    when(users.update("user-1", new UserDescription("After"))).thenReturn(user("user-1", "After"));
    api()
        .contentType("application/json")
        .body(Map.of("displayName", "After"))
        .put("/api/users/user-1")
        .then()
        .statusCode(200)
        .body("id", is("user-1"))
        .body("displayName", is("After"))
        .body("_links.self.href", is("/api/users/user-1"));
    verify(users).findByIdentity("user-1");
    verify(users).update("user-1", new UserDescription("After"));
    verifyNoMoreInteractions(users);
    assertEquals("Before", original.getDescription().displayName());
  }

  @Test
  void deleteDelegatesTheLoadedIdentityAndReturnsNoContent() {
    when(users.findByIdentity("user-1")).thenReturn(Optional.of(user("user-1", "A")));
    api().delete("/api/users/user-1").then().statusCode(204).body(is(""));
    verify(users).findByIdentity("user-1");
    verify(users).delete("user-1");
    verifyNoMoreInteractions(users);
  }

  @Test
  void invalidDescriptionReturns400WithoutUpdatingTheLoadedEntity() {
    User original = user("user-1", "Before");
    when(users.findByIdentity("user-1")).thenReturn(Optional.of(original));
    api()
        .contentType("application/json")
        .body(Map.of("displayName", " "))
        .put("/api/users/user-1")
        .then()
        .statusCode(400)
        .body("code", is("INVALID_DISPLAY_NAME"));
    verify(users).findByIdentity("user-1");
    verifyNoMoreInteractions(users);
    assertEquals("Before", original.getDescription().displayName());
  }

  @ParameterizedTest
  @ValueSource(strings = {"PUT", "DELETE"})
  void aMemberDisappearingAfterLookupIsStillMappedTo404(String method) {
    when(users.findByIdentity("user-1")).thenReturn(Optional.of(user("user-1", "A")));
    var request = api();
    if (method.equals("PUT")) {
      when(users.update(eq("user-1"), any())).thenThrow(new UserNotFoundException());
      request.contentType("application/json").body(Map.of("displayName", "B"));
    } else {
      doThrow(new UserNotFoundException()).when(users).delete("user-1");
    }
    request
        .request(method, "/api/users/user-1")
        .then()
        .statusCode(404)
        .body("code", is("USER_NOT_FOUND"));
  }
}
