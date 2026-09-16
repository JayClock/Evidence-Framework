package com.evidencepoc.backend.persistent;

import static org.junit.jupiter.api.Assertions.*;

import com.evidencepoc.backend.domain.UserNotFoundException;
import com.evidencepoc.backend.domain.context.SubscriptionContext;
import com.evidencepoc.backend.domain.description.UserDescription;
import com.evidencepoc.backend.domain.model.User;
import com.evidencepoc.backend.domain.model.Users;
import com.evidencepoc.backend.domain.role.Reader;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(
    classes = MyBatisUsersTests.TestApplication.class,
    webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
class MyBatisUsersTests {
  @Configuration(proxyBeanMethods = false)
  @EnableAutoConfiguration
  @ComponentScan("com.evidencepoc.backend.persistent")
  static class TestApplication {}

  @Autowired Users users;
  @Autowired SubscriptionContext subscriptionContext;
  @Autowired JdbcTemplate jdbc;
  @Autowired PlatformTransactionManager transactionManager;
  @Autowired ApplicationContext context;

  @BeforeEach
  void clearUsers() {
    jdbc.update("DELETE FROM app_users");
  }

  @Test
  void realSqlRoundTripPreservesIdentityAndDoesNotMergeEqualNames() {
    User created = users.create(new UserDescription("小明"));
    assertDoesNotThrow(() -> UUID.fromString(created.getIdentity()));
    User sameName = users.create(new UserDescription("小明"));
    assertNotEquals(created.getIdentity(), sameName.getIdentity());
    assertEquals(
        "小明",
        users.findByIdentity(created.getIdentity()).orElseThrow().getDescription().displayName());
    assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM app_users", Integer.class));
    User updated = users.update(created.getIdentity(), new UserDescription("新名称"));
    assertEquals(created.getIdentity(), updated.getIdentity());
    assertEquals(
        "新名称",
        jdbc.queryForObject(
            "SELECT display_name FROM app_users WHERE id = ?",
            String.class,
            created.getIdentity()));
    assertEquals(
        "小明",
        users.findByIdentity(sameName.getIdentity()).orElseThrow().getDescription().displayName());
    users.delete(created.getIdentity());
    assertTrue(users.findByIdentity(created.getIdentity()).isEmpty());
    assertEquals(1, users.findAll().size());
  }

  @Test
  void paginationHasStableOrderAndBoundedPages() {
    List<String> ids =
        List.of(
                users.create(new UserDescription("A")).getIdentity(),
                users.create(new UserDescription("B")).getIdentity(),
                users.create(new UserDescription("C")).getIdentity())
            .stream()
            .sorted()
            .toList();
    assertEquals(
        ids.subList(0, 2),
        users.findAll().subCollection(0, 2).stream().map(User::getIdentity).toList());
    assertEquals(
        ids.subList(2, 3),
        users.findAll().subCollection(2, 4).stream().map(User::getIdentity).toList());
    assertEquals(0, users.findAll().subCollection(10, 12).size());
  }

  @Test
  void absentUpdateAndDeleteDoNotCreateAUser() {
    assertTrue(users.findByIdentity("missing").isEmpty());
    assertThrows(
        UserNotFoundException.class, () -> users.update("missing", new UserDescription("A")));
    assertThrows(UserNotFoundException.class, () -> users.delete("missing"));
    assertEquals(0, users.findAll().size());
  }

  @Test
  void namesAndIdentityQueriesAreBoundParameters() {
    String input = "Robert'); DROP TABLE app_users;--";
    User created = users.create(new UserDescription(input));
    assertEquals(
        input,
        users.findByIdentity(created.getIdentity()).orElseThrow().getDescription().displayName());
    assertTrue(users.findByIdentity("' OR '1'='1").isEmpty());
    assertEquals(1, users.findAll().size());
  }

  @Test
  void allWritesParticipateInTheLocalTransactionAndRollback() {
    User existing = users.create(new UserDescription("original"));
    TransactionTemplate transaction = new TransactionTemplate(transactionManager);
    assertThrows(
        IllegalStateException.class,
        () ->
            transaction.executeWithoutResult(
                status -> {
                  users.create(new UserDescription("new"));
                  users.update(existing.getIdentity(), new UserDescription("changed"));
                  users.delete(existing.getIdentity());
                  throw new IllegalStateException("force rollback");
                }));
    assertEquals(1, users.findAll().size());
    assertEquals(
        "original",
        users.findByIdentity(existing.getIdentity()).orElseThrow().getDescription().displayName());
  }

  @Test
  void subscriptionContextIsInjectedAndDecoratesTheGivenUser() {
    User created = users.create(new UserDescription("小明"));
    SubscriptionContext subscription = users.inSubscriptionContext();
    assertSame(subscriptionContext, subscription);

    User snapshot = new User(created.getIdentity(), new UserDescription("过期快照"));
    Reader reader = subscription.asReader(snapshot);

    assertEquals(created.getIdentity(), reader.readerId());
    assertSame(snapshot, reader.actor());
    assertEquals("过期快照", reader.actor().getDescription().displayName());
    assertThrows(IllegalArgumentException.class, () -> subscription.asReader(null));
  }

  @Test
  void startersAndFlywayAreActuallyLoaded() {
    assertNotNull(context.getBean("genericEntityHydrator"));
    assertNotNull(context.getBean("injectableObjectFactory"));
    assertEquals(
        "HydratingCacheManager", context.getBean("cacheManager").getClass().getSimpleName());
    assertEquals(
        "io.github.jayclock.smartdomain.mybatis.support.InjectableObjectFactory",
        context
            .getBean(SqlSessionFactory.class)
            .getConfiguration()
            .getObjectFactory()
            .getClass()
            .getName());
    assertEquals(
        1,
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM \"flyway_schema_history\" WHERE \"success\" = TRUE AND \"version\" = '1'",
            Integer.class));
  }
}
