package com.evidencepoc.backend.api;

import static org.hamcrest.Matchers.*;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.evidencepoc.backend.domain.description.UserDescription;
import com.evidencepoc.backend.domain.model.User;
import java.net.URI;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class UsersApiTests extends ApiTest {
  @Test
  void createDelegatesTheDescriptionAndReturnsAnAddressableUser() {
    when(users.create(new UserDescription("小明"))).thenReturn(user("user-1", "小明"));
    String location =
        api()
            .contentType("application/json")
            .body(Map.of("displayName", "小明"))
            .post("/api/users")
            .then()
            .statusCode(201)
            .body("id", is("user-1"))
            .body("displayName", is("小明"))
            .body("_links.self.href", is("/api/users/user-1"))
            .body("_templates.default.method", is("PUT"))
            .body("_templates.delete.method", is("DELETE"))
            .extract()
            .header("Location");
    org.junit.jupiter.api.Assertions.assertEquals(
        "/api/users/user-1", URI.create(location).getPath());
    verify(users).create(new UserDescription("小明"));
    verifyNoMoreInteractions(users);
  }

  @Test
  void paginationUsesManySlicesAndItsLinksAreFollowable() {
    TestMany<User> all =
        spy(new TestMany<>(List.of(user("a", "A"), user("b", "B"), user("c", "C"))));
    when(users.findAll()).thenReturn(all);
    String next =
        api()
            .get("/api/users?page=0&size=2")
            .then()
            .statusCode(200)
            .body("_embedded.users.id", contains("a", "b"))
            .body("page.number", is(0))
            .body("page.size", is(2))
            .body("page.totalElements", is(3))
            .body("page.totalPages", is(2))
            .body("_links.self.href", is("/api/users?page=0&size=2"))
            .body("_links.prev", nullValue())
            .extract()
            .path("_links.next.href");
    api()
        .get(next)
        .then()
        .statusCode(200)
        .body("_embedded.users.id", contains("c"))
        .body("_links.prev.href", is("/api/users?page=0&size=2"))
        .body("_links.next", nullValue());
    verify(all).subCollection(0, 2);
    verify(all).subCollection(2, 3);
    verify(all, never()).iterator();
  }

  @Test
  void emptyCollectionKeepsDefaultPaginationAndWritableCreateAffordance() {
    when(users.findAll()).thenReturn(new TestMany<>(List.of()));
    api()
        .get("/api/users")
        .then()
        .statusCode(200)
        .body("$", not(hasKey("_embedded")))
        .body("page.number", is(0))
        .body("page.size", is(20))
        .body("page.totalElements", is(0))
        .body("page.totalPages", is(0))
        .body("_links.self.href", is("/api/users?page=0&size=20"))
        .body("_templates.default.method", is("POST"))
        .body("_templates.default.properties.find { it.name == 'displayName' }.required", is(true))
        .body("_templates.default.properties.find { it.name == 'displayName' }.type", is("text"))
        .body("_templates.default.properties.find { it.name == 'displayName' }.maxLength", is(100))
        .body(
            "_templates.default.properties.find { it.name == 'displayName' }.readOnly",
            anyOf(nullValue(), is(false)));
  }

  @Test
  void exactBoundaryAllowsAnEmptyPageButFurtherPagesAreNotFound() {
    when(users.findAll()).thenReturn(new TestMany<>(List.of(user("a", "A"), user("b", "B"))));
    String next =
        api()
            .get("/api/users?page=0&size=2")
            .then()
            .statusCode(200)
            .body("_links.next.href", is("/api/users?page=1&size=2"))
            .extract()
            .path("_links.next.href");
    api()
        .get(next)
        .then()
        .statusCode(200)
        .body("$", not(hasKey("_embedded")))
        .body("page.number", is(1))
        .body("page.totalPages", is(1))
        .body("_links.next", nullValue());
    api().get("/api/users?page=2&size=2").then().statusCode(404);
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "page=-1",
        "size=0",
        "size=101",
        "page=abc",
        "size=1.5",
        "page=2147483647&size=1",
        "page=21474836&size=100",
        "page=2147483648"
      })
  void invalidPaginationDoesNotCallTheDomain(String query) {
    api().get("/api/users?" + query).then().statusCode(400).body("code", is("BAD_REQUEST"));
    verifyNoInteractions(users);
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "{}",
        "null",
        "{\"displayName\":null}",
        "{\"displayName\":\"\"}",
        "{\"displayName\":\"  \"}",
        "{",
        "{\"id\":\"client-id\",\"displayName\":\"A\"}"
      })
  void invalidCreateDoesNotCallTheDomain(String input) {
    api().contentType("application/json").body(input).post("/api/users").then().statusCode(400);
    verifyNoInteractions(users);
  }
}
