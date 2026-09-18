package com.evidencepoc.backend.api.config;

import com.evidencepoc.backend.api.RootApi;
import com.evidencepoc.backend.api.SalesPerformanceExceptionMappers;
import com.evidencepoc.backend.api.UserExceptionMappers;
import org.glassfish.jersey.server.ResourceConfig;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

/** API-only composition: real Jersey/HAL, no application or persistence module dependency. */
@SpringBootConfiguration
@EnableAutoConfiguration
@Import(RootApi.class)
public class ApiTestApplication {
  @Bean
  ResourceConfig resources() {
    return new ResourceConfig(
        RootApi.class,
        UserExceptionMappers.NotFound.class,
        UserExceptionMappers.InvalidDescription.class,
        UserExceptionMappers.BadRequest.class,
        SalesPerformanceExceptionMappers.AgreementNotFound.class,
        SalesPerformanceExceptionMappers.InvalidInput.class,
        SalesPerformanceExceptionMappers.Conflict.class,
        SalesPerformanceExceptionMappers.IdempotencyReuse.class);
  }
}
