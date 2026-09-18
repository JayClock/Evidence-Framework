package com.evidencepoc.backend;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.evidencepoc.backend.domain.IdempotencyLedger;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

@AnalyzeClasses(
    packages = "com.evidencepoc.backend",
    importOptions = ImportOption.DoNotIncludeTests.class)
class BackendArchitectureTests {
  @ArchTest
  static final ArchRule domainIsIndependent =
      noClasses()
          .that()
          .resideInAPackage("..domain..")
          .should()
          .dependOnClassesThat()
          .resideInAnyPackage(
              "..api..",
              "..persistent..",
              "..config..",
              "org.springframework..",
              "org.apache.ibatis..",
              "org.mybatis..",
              "jakarta.ws.rs..",
              "com.fasterxml.jackson..",
              "io.github.jayclock.smartdomain.mybatis..");

  @ArchTest
  static final ArchRule apiDoesNotReachPersistence =
      noClasses()
          .that()
          .resideInAPackage("..api..")
          .should()
          .dependOnClassesThat()
          .resideInAnyPackage(
              "..persistent..",
              "..config..",
              "org.apache.ibatis..",
              "org.mybatis..",
              "org.springframework.jdbc..");

  @ArchTest
  static final ArchRule idempotencyLedgerIsImplementedInPersistence =
      classes()
          .that()
          .implement(IdempotencyLedger.class)
          .should()
          .resideInAPackage("..persistent..");

  @ArchTest
  static final ArchRule persistenceDoesNotReachHttp =
      noClasses()
          .that()
          .resideInAPackage("..persistent..")
          .should()
          .dependOnClassesThat()
          .resideInAnyPackage(
              "com.evidencepoc.backend.api..",
              "com.evidencepoc.backend.config..",
              "jakarta.ws.rs..");
}
