package com.evidencepoc.backend.persistent.associations;

import com.evidencepoc.backend.domain.UserNotFoundException;
import com.evidencepoc.backend.domain.description.UserDescription;
import com.evidencepoc.backend.domain.model.User;
import com.evidencepoc.backend.persistent.mappers.UsersMapper;
import io.github.jayclock.smartdomain.core.Many;
import io.github.jayclock.smartdomain.mybatis.database.EntityList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class Users implements com.evidencepoc.backend.domain.model.Users {
  private final UsersMapper mapper;

  public Users(UsersMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  public Optional<User> findByIdentity(String id) {
    return Optional.ofNullable(mapper.findByIdentity(id));
  }

  @Override
  public Many<User> findAll() {
    return new UserCollection(mapper);
  }

  @Override
  @Transactional
  public User create(UserDescription description) {
    User user = new User(UUID.randomUUID().toString(), description);
    if (mapper.insert(user.getIdentity(), description) != 1) {
      throw new IllegalStateException("User insert did not affect one row");
    }
    return user;
  }

  @Override
  @Transactional
  public User update(String identity, UserDescription description) {
    User updated =
        findByIdentity(identity).orElseThrow(UserNotFoundException::new).renameTo(description);
    if (mapper.update(identity, updated.getDescription()) != 1) {
      throw new UserNotFoundException();
    }
    return updated;
  }

  @Override
  @Transactional
  public void delete(String identity) {
    if (mapper.delete(identity) != 1) {
      throw new UserNotFoundException();
    }
  }

  // The collection is not an AOP bean; EntityList's final methods stay outside Spring proxies.
  private static final class UserCollection extends EntityList<String, User> {
    private final UsersMapper mapper;

    private UserCollection(UsersMapper mapper) {
      this.mapper = mapper;
    }

    @Override
    protected List<User> findEntities(int from, int to) {
      if (from < 0 || to < from) {
        throw new IllegalArgumentException("Invalid collection range");
      }
      return mapper.findPage(from, to - from);
    }

    @Override
    protected User findEntity(String id) {
      return mapper.findByIdentity(id);
    }

    @Override
    public int size() {
      return mapper.count();
    }
  }
}
