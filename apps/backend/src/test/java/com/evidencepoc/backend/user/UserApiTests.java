package com.evidencepoc.backend.user;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class UserApiTests {
  private static final String HAL_FORMS = "application/prs.hal-forms+json";
  @Autowired TestRestTemplate http;
  @Autowired ObjectMapper json;
  @Autowired JdbcTemplate jdbc;

  @BeforeEach
  void clearUsers() {
    jdbc.update("DELETE FROM app_users");
  }

  @Test
  void crudThroughRealHttpAndSqlWithLocationAndStableIdentity() throws Exception {
    ResponseEntity<String> created = request(HttpMethod.POST, "/api/users", body("小明"), HAL_FORMS);
    assertEquals(201, created.getStatusCode().value(), created.getBody());
    JsonNode user = tree(created);
    String id = user.path("id").asText();
    assertFalse(id.isBlank());
    assertEquals("小明", user.path("displayName").asText());
    String location = created.getHeaders().getLocation().toString();
    assertTrue(location.endsWith("/api/users/" + id));
    assertEquals(
        created.getHeaders().getLocation().getRawPath(), user.at("/_links/self/href").asText());
    assertEquals("/api/users/" + id, user.at("/_links/self/href").asText());
    // Spring HATEOAS names the first HAL-FORMS template "default" per the protocol.
    assertEquals("PUT", user.at("/_templates/default/method").asText());
    assertEquals("DELETE", user.at("/_templates/delete/method").asText());
    assertWritableDisplayName(user.at("/_templates/default/properties"));

    ResponseEntity<String> fetched =
        request(HttpMethod.GET, location, null, "application/hal+json");
    assertEquals(200, fetched.getStatusCode().value(), fetched.getBody());
    assertEquals(id, tree(fetched).path("id").asText());
    ResponseEntity<String> changed = request(HttpMethod.PUT, location, body("新名称"), HAL_FORMS);
    assertEquals(200, changed.getStatusCode().value(), changed.getBody());
    assertEquals(id, tree(changed).path("id").asText());
    assertEquals("新名称", tree(changed).path("displayName").asText());
    assertEquals(
        "新名称",
        jdbc.queryForObject("SELECT display_name FROM app_users WHERE id = ?", String.class, id));

    ResponseEntity<String> deleted = request(HttpMethod.DELETE, location, null, HAL_FORMS);
    assertEquals(204, deleted.getStatusCode().value());
    assertTrue(deleted.getBody() == null || deleted.getBody().isEmpty());
    assertEquals(404, request(HttpMethod.GET, location, null, HAL_FORMS).getStatusCode().value());
    assertEquals(
        404, request(HttpMethod.PUT, location, body("missing"), HAL_FORMS).getStatusCode().value());
    assertEquals(
        404, request(HttpMethod.DELETE, location, null, HAL_FORMS).getStatusCode().value());
    assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM app_users", Integer.class));
  }

  @Test
  void collectionSupportsEmptyPagesCreateAffordanceAndNavigation() throws Exception {
    ResponseEntity<String> emptyResponse = request(HttpMethod.GET, "/api/users", null, HAL_FORMS);
    assertEquals(200, emptyResponse.getStatusCode().value(), emptyResponse.getBody());
    JsonNode empty = tree(emptyResponse);
    assertEquals(0, empty.at("/page/totalElements").asInt(-1));
    // Direct Pagination/PagedModel uses the framework's empty HAL form (no _embedded).
    assertFalse(empty.has("_embedded"), empty.toString());
    assertEquals(0, empty.at("/page/totalPages").asInt(-1));
    assertTrue(empty.at("/_links/self/href").asText().contains("page=0"));
    assertEquals("POST", empty.at("/_templates/default/method").asText());
    assertWritableDisplayName(empty.at("/_templates/default/properties"));
    Set<String> expected = new HashSet<>();
    for (String name : new String[] {"A", "B", "C"}) {
      ResponseEntity<String> created =
          request(HttpMethod.POST, "/api/users", body(name), HAL_FORMS);
      assertEquals(201, created.getStatusCode().value());
      expected.add(tree(created).path("id").asText());
    }
    JsonNode first = tree(request(HttpMethod.GET, "/api/users?page=0&size=2", null, HAL_FORMS));
    assertEquals(3, first.at("/page/totalElements").asInt());
    assertEquals(2, first.at("/_embedded/users").size());
    assertTrue(first.at("/_links/prev").isMissingNode());
    JsonNode second =
        tree(request(HttpMethod.GET, first.at("/_links/next/href").asText(), null, HAL_FORMS));
    assertEquals(1, second.at("/_embedded/users").size());
    assertTrue(second.at("/_links/next").isMissingNode());
    assertTrue(second.at("/_links/prev/href").asText().contains("page=0"));
    Set<String> seen = new HashSet<>();
    first.at("/_embedded/users").forEach(user -> seen.add(user.path("id").asText()));
    second.at("/_embedded/users").forEach(user -> seen.add(user.path("id").asText()));
    assertEquals(expected, seen);
    assertEquals(
        404,
        request(HttpMethod.GET, "/api/users?page=9&size=2", null, HAL_FORMS)
            .getStatusCode()
            .value());
  }

  @Test
  void paginationPreservesTheLibraryExactBoundaryEmptyPage() throws Exception {
    for (String name : new String[] {"A", "B"}) {
      assertEquals(
          201,
          request(HttpMethod.POST, "/api/users", body(name), HAL_FORMS).getStatusCode().value());
    }
    JsonNode full = tree(request(HttpMethod.GET, "/api/users?page=0&size=2", null, HAL_FORMS));
    assertEquals(2, full.at("/_embedded/users").size());
    String next = full.at("/_links/next/href").asText();
    assertEquals("/api/users?page=1&size=2", next);
    ResponseEntity<String> last = request(HttpMethod.GET, next, null, HAL_FORMS);
    assertEquals(200, last.getStatusCode().value());
    JsonNode empty = tree(last);
    assertFalse(empty.has("_embedded"));
    assertEquals(1, empty.at("/page/number").asInt());
    assertEquals(1, empty.at("/page/totalPages").asInt());
    assertTrue(empty.at("/_links/next").isMissingNode());
    assertEquals(
        404,
        request(HttpMethod.GET, "/api/users?page=2&size=2", null, HAL_FORMS)
            .getStatusCode()
            .value());
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
        "{\"id\":\"client-id\",\"displayName\":\"A\"}",
        "{\"displayName\":42}",
        "{\"displayName\":true}",
        "{\"displayName\":1.5}",
        "{\"displayName\":[]}",
        "{\"displayName\":{}}",
        "{\"displayName\":\"A\"} {}"
      })
  void invalidCreateDoesNotWrite(String input) {
    ResponseEntity<String> response = request(HttpMethod.POST, "/api/users", input, HAL_FORMS);
    assertEquals(400, response.getStatusCode().value(), response.getBody());
    assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM app_users", Integer.class));
  }

  @Test
  void invalidUpdateDoesNotModifyExistingUserAndNameLengthIsEnforced() throws Exception {
    ResponseEntity<String> created =
        request(HttpMethod.POST, "/api/users", body("名".repeat(100)), HAL_FORMS);
    assertEquals(201, created.getStatusCode().value());
    String location = created.getHeaders().getLocation().toString();
    assertEquals(
        400,
        request(HttpMethod.PUT, location, body("名".repeat(101)), HAL_FORMS)
            .getStatusCode()
            .value());
    assertEquals(
        400,
        request(HttpMethod.POST, "/api/users", body("名".repeat(101)), HAL_FORMS)
            .getStatusCode()
            .value());
    assertEquals(
        "名".repeat(100),
        tree(request(HttpMethod.GET, location, null, HAL_FORMS)).path("displayName").asText());
    assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM app_users", Integer.class));
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "page=-1",
        "size=0",
        "size=101",
        "size=-1",
        "page=2147483647",
        "page=2147483648",
        "page=abc",
        "size=abc",
        "page=",
        "size=2147483648"
      })
  void rejectsInvalidPagination(String query) {
    assertEquals(
        400,
        request(HttpMethod.GET, "/api/users?" + query, null, HAL_FORMS).getStatusCode().value());
  }

  @ParameterizedTest
  @ValueSource(strings = {"application/json", "application/hal+json", HAL_FORMS})
  void negotiatesSupportedMediaTypes(String mediaType) {
    ResponseEntity<String> response = request(HttpMethod.GET, "/api/users", null, mediaType);
    assertEquals(200, response.getStatusCode().value(), response.getBody());
    assertTrue(
        MediaType.parseMediaType(mediaType)
            .isCompatibleWith(response.getHeaders().getContentType()));
  }

  @Test
  void actuatorSurvivesTheFrameworkIntegration() throws Exception {
    ResponseEntity<String> health = http.getForEntity("/actuator/health", String.class);
    assertEquals(200, health.getStatusCode().value(), health.getBody());
    assertEquals("UP", tree(health).path("status").asText());
  }

  @Test
  void rootLinksNavigateToUsers() throws Exception {
    ResponseEntity<String> root = request(HttpMethod.GET, "/api/", null, HAL_FORMS);
    assertEquals(200, root.getStatusCode().value());
    assertEquals("/api/users", tree(root).at("/_links/users/href").asText());
    assertEquals(
        200,
        request(HttpMethod.GET, tree(root).at("/_links/users/href").asText(), null, HAL_FORMS)
            .getStatusCode()
            .value());
  }

  private static void assertWritableDisplayName(JsonNode properties) {
    assertTrue(properties.isArray());
    assertEquals(1, properties.size());
    JsonNode property = properties.get(0);
    assertEquals("displayName", property.path("name").asText());
    assertFalse(property.path("readOnly").asBoolean());
    assertTrue(property.path("required").asBoolean());
    assertEquals("text", property.path("type").asText());
    assertEquals(100, property.path("maxLength").asInt());
  }

  private String body(String name) throws Exception {
    return json.writeValueAsString(Map.of("displayName", name));
  }

  private JsonNode tree(ResponseEntity<String> response) throws Exception {
    return json.readTree(response.getBody());
  }

  private ResponseEntity<String> request(
      HttpMethod method, String path, String body, String accept) {
    HttpHeaders headers = new HttpHeaders();
    headers.set(HttpHeaders.ACCEPT, accept);
    headers.setContentType(MediaType.APPLICATION_JSON);
    return http.exchange(path, method, new HttpEntity<>(body, headers), String.class);
  }
}
