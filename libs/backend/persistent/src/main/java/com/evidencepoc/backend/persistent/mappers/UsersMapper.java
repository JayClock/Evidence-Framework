package com.evidencepoc.backend.persistent.mappers;

import com.evidencepoc.backend.domain.description.UserDescription;
import com.evidencepoc.backend.domain.model.User;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UsersMapper {
  User findByIdentity(@Param("id") String id);

  List<User> findPage(@Param("offset") int offset, @Param("limit") int limit);

  int count();

  int insert(@Param("id") String id, @Param("description") UserDescription description);

  int update(@Param("id") String id, @Param("description") UserDescription description);

  int delete(@Param("id") String id);
}
