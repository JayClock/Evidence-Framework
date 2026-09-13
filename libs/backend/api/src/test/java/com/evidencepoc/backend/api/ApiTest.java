package com.evidencepoc.backend.api;

import com.evidencepoc.backend.api.config.ApiTestApplication;
import com.evidencepoc.backend.domain.description.UserDescription;
import com.evidencepoc.backend.domain.model.User;
import com.evidencepoc.backend.domain.model.Users;
import io.restassured.RestAssured;
import io.restassured.specification.RequestSpecification;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest(
    classes = ApiTestApplication.class,
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "server.address=127.0.0.1",
      "spring.jersey.application-path=/api",
      "spring.jackson.deserialization.fail-on-unknown-properties=true"
    })
@ActiveProfiles("test")
abstract class ApiTest {
  @LocalServerPort private int port;
  @MockitoBean protected Users users;

  protected RequestSpecification api() {
    // Per-request settings, not RestAssured's mutable global port/basePath.
    return RestAssured.given()
        .baseUri("http://127.0.0.1")
        .port(port)
        .accept("application/prs.hal-forms+json");
  }

  protected static User user(String id, String name) {
    return new User(id, new UserDescription(name));
  }
}
