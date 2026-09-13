package com.evidencepoc.backend.config;

import com.evidencepoc.backend.api.RootApi;
import com.evidencepoc.backend.api.UserExceptionMappers;
import org.glassfish.jersey.server.ResourceConfig;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
public class JerseyConfiguration extends ResourceConfig {
  public JerseyConfiguration(Environment environment) {
    // CRUD is a local development capability, not an unauthenticated production endpoint.
    if (environment.matchesProfiles("local", "test")) {
      register(RootApi.class);
      register(UserExceptionMappers.NotFound.class);
      register(UserExceptionMappers.InvalidDescription.class);
      register(UserExceptionMappers.BadRequest.class);
    }
  }
}
