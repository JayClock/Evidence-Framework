package com.evidencepoc.backend.api;

import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;

class RootApiTests extends ApiTest {
  @Autowired ApplicationContext context;

  @Test
  void rootExposesAFollowableUsersLink() {
    when(users.findAll()).thenReturn(new TestMany<>(List.of()));
    String collection =
        api()
            .get("/api/")
            .then()
            .statusCode(200)
            .body("_links.self.href", is("/api/"))
            .body("_links.users.href", is("/api/users"))
            .extract()
            .path("_links.users.href");
    api().get(collection).then().statusCode(200).body("page.totalElements", is(0));
    verify(users).findAll();
  }

  @Test
  void apiCompositionDoesNotStartPersistence() {
    assertEquals(0, context.getBeanNamesForType(DataSource.class).length);
    assertFalse(context.containsBean("sqlSessionFactory"));
  }
}
