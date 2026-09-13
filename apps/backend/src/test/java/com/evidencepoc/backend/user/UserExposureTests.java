package com.evidencepoc.backend.user;

import static org.junit.jupiter.api.Assertions.*;

import com.evidencepoc.backend.api.RootApi;
import com.evidencepoc.backend.config.JerseyConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.mock.env.MockEnvironment;

class UserExposureTests {
  @Test
  void productionDoesNotRegisterUserCrudOrCreateItsResourceBean() {
    MockEnvironment environment = new MockEnvironment();
    environment.setActiveProfiles("production");
    JerseyConfiguration jersey = new JerseyConfiguration(environment);
    assertFalse(jersey.isRegistered(RootApi.class));
    try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
      context.getEnvironment().setActiveProfiles("production");
      context.register(RootApi.class);
      context.refresh();
      assertEquals(0, context.getBeanNamesForType(RootApi.class).length);
    }
  }
}
