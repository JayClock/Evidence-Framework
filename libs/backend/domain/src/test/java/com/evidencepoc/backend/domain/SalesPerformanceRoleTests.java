package com.evidencepoc.backend.domain;

import static org.junit.jupiter.api.Assertions.*;

import com.evidencepoc.backend.domain.context.SalesPerformanceContext;
import com.evidencepoc.backend.domain.context.SubscriptionContext;
import com.evidencepoc.backend.domain.description.UserDescription;
import com.evidencepoc.backend.domain.model.User;
import com.evidencepoc.backend.domain.model.Users;
import com.evidencepoc.backend.domain.role.PerformanceManager;
import com.evidencepoc.backend.domain.role.TeleSales;
import io.github.jayclock.smartdomain.core.Many;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class SalesPerformanceRoleTests {
  @Test
  void switchesTheSameUserSnapshotIntoBothSalesRoles() {
    Users users = new InMemoryUsers();
    User snapshot = user("user-1", "过期快照");

    SalesPerformanceContext context = users.inSalesPerformanceContext();
    PerformanceManager manager = context.asPerformanceManager(snapshot);
    TeleSales teleSales = context.asTeleSales(snapshot);

    assertEquals(PerformanceManager.ROLE_ID, manager.roleId());
    assertEquals(TeleSales.ROLE_ID, teleSales.roleId());
    assertEquals("user-1", manager.managerId());
    assertEquals("user-1", teleSales.teleSalesId());
    assertSame(snapshot, manager.actor());
    assertSame(snapshot, teleSales.actor());
    assertEquals("过期快照", teleSales.actor().getDescription().displayName());
  }

  @Test
  void refusesMissingUserReferenceWithoutMintingASalesRole() {
    SalesPerformanceContext context = new InMemoryUsers().inSalesPerformanceContext();

    assertThrows(IllegalArgumentException.class, () -> context.asPerformanceManager(null));
    assertThrows(IllegalArgumentException.class, () -> context.asTeleSales(null));
  }

  @Test
  void roleSwitchDoesNotReReadTheUser() {
    InMemoryUsers users = new InMemoryUsers();
    User snapshot = user("user-1", "过期快照");

    users.inSalesPerformanceContext().asTeleSales(snapshot);

    assertEquals(0, users.findByIdentityCalls);
  }

  private static User user(String id, String displayName) {
    return new User(id, new UserDescription(displayName));
  }

  private static final class InMemoryUsers implements Users {
    private int findByIdentityCalls;

    @Override
    public Many<User> findAll() {
      throw new UnsupportedOperationException("not needed by sales role tests");
    }

    @Override
    public Optional<User> findByIdentity(String identifier) {
      findByIdentityCalls++;
      throw new AssertionError("role switching must not re-read the user");
    }

    @Override
    public SalesPerformanceContext inSalesPerformanceContext() {
      return new InMemorySalesPerformanceContext();
    }

    @Override
    public SubscriptionContext inSubscriptionContext() {
      throw new UnsupportedOperationException("not needed by sales role tests");
    }

    @Override
    public User create(UserDescription description) {
      throw new UnsupportedOperationException("not needed by sales role tests");
    }

    @Override
    public User update(String identity, UserDescription description) {
      throw new UnsupportedOperationException("not needed by sales role tests");
    }

    @Override
    public void delete(String identity) {
      throw new UnsupportedOperationException("not needed by sales role tests");
    }
  }

  private static final class InMemorySalesPerformanceContext implements SalesPerformanceContext {
    @Override
    public PerformanceManager asPerformanceManager(User user) {
      if (user == null) {
        throw new IllegalArgumentException("User is required");
      }
      return new PerformanceManager(user);
    }

    @Override
    public TeleSales asTeleSales(User user) {
      if (user == null) {
        throw new IllegalArgumentException("User is required");
      }
      return new TeleSales(user);
    }
  }
}
