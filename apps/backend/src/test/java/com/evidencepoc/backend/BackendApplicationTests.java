package com.evidencepoc.backend;

import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;

@ActiveProfiles("test")
@SpringBootTest
class BackendApplicationTests {
  @Autowired ApplicationContext context;

  @Test
  void startersAreAssembledAcrossModules() {
    assertNotNull(context.getBean("genericEntityHydrator"));
    assertNotNull(context.getBean("smartDomainApiJerseyCustomizer"));
    assertNotNull(context.getBean("halFormsConfiguration"));
  }
}
