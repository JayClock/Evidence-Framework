package com.evidencepoc.backend.domain;

import static org.junit.jupiter.api.Assertions.*;

import com.evidencepoc.backend.domain.context.SubscriptionContext;
import com.evidencepoc.backend.domain.description.UserDescription;
import com.evidencepoc.backend.domain.model.User;
import com.evidencepoc.backend.domain.model.Users;
import com.evidencepoc.backend.domain.role.Reader;
import io.github.jayclock.smartdomain.core.Many;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class ReaderTests {
  @Test
  void entersSubscriptionContextBeforeSwitchingGivenUserIntoReaderRole() {
    Users users = new InMemoryUsers();
    User snapshot = user("reader-1", "过期快照");

    Reader reader = users.inSubscriptionContext().asReader(snapshot);

    assertEquals(Reader.ROLE_ID, reader.roleId());
    assertEquals("reader-1", reader.readerId());
    assertSame(snapshot, reader.actor());
    assertEquals("过期快照", reader.actor().getDescription().displayName());
  }

  @Test
  void refusesMissingUserReferenceWithoutMintingAReaderRole() {
    Users users = new InMemoryUsers();

    assertThrows(
        IllegalArgumentException.class, () -> users.inSubscriptionContext().asReader(null));
  }

  @Test
  void readerRoleItselfIsJustTheDecoratedUserInSubscriptionContext() {
    User actor = user("reader-1", "小明");
    Reader reader = new Reader(actor);

    assertSame(actor, reader.actor());
    assertEquals(Reader.ROLE_ID, reader.roleId());
    assertEquals("reader-1", reader.readerId());
    assertThrows(NullPointerException.class, () -> new Reader(null));
  }

  private static User user(String id, String displayName) {
    return new User(id, new UserDescription(displayName));
  }

  private static final class InMemoryUsers implements Users {
    @Override
    public Many<User> findAll() {
      throw new UnsupportedOperationException("not needed by reader role tests");
    }

    @Override
    public Optional<User> findByIdentity(String identifier) {
      throw new AssertionError("asReader must not re-read the user");
    }

    @Override
    public SubscriptionContext inSubscriptionContext() {
      return new InMemorySubscriptionContext();
    }

    @Override
    public User create(UserDescription description) {
      throw new UnsupportedOperationException("not needed by reader role tests");
    }

    @Override
    public User update(String identity, UserDescription description) {
      throw new UnsupportedOperationException("not needed by reader role tests");
    }

    @Override
    public void delete(String identity) {
      throw new UnsupportedOperationException("not needed by reader role tests");
    }
  }

  private static final class InMemorySubscriptionContext implements SubscriptionContext {
    @Override
    public Reader asReader(User user) {
      if (user == null) {
        throw new IllegalArgumentException("User is required to switch into role.reader");
      }
      return new Reader(user);
    }
  }
}
