package com.evidencepoc.backend.config;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.cfg.CoercionAction;
import com.fasterxml.jackson.databind.cfg.CoercionInputShape;
import com.fasterxml.jackson.databind.type.LogicalType;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class JacksonConfiguration {
  @Bean
  Jackson2ObjectMapperBuilderCustomizer strictJsonRequests() {
    return builder ->
        builder
            .featuresToEnable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .postConfigurer(
                mapper -> {
                  var text = mapper.coercionConfigFor(LogicalType.Textual);
                  text.setCoercion(CoercionInputShape.Integer, CoercionAction.Fail);
                  text.setCoercion(CoercionInputShape.Float, CoercionAction.Fail);
                  text.setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail);
                });
  }
}
