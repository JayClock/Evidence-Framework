package com.evidencepoc.backend.domain;

import static org.junit.jupiter.api.Assertions.*;

import com.evidencepoc.backend.domain.description.UserDescription;
import com.evidencepoc.backend.domain.model.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class UserTests {
  @ParameterizedTest
  @NullAndEmptySource
  @ValueSource(strings = {" ", "\t\n", "\u2003"})
  void rejectsMissingOrBlankDisplayName(String name) {
    assertThrows(InvalidUserDescriptionException.class, () -> new UserDescription(name));
  }

  @Test
  void boundsDisplayNameAndPreservesInput() {
    assertEquals("名".repeat(100), new UserDescription("名".repeat(100)).displayName());
    assertThrows(InvalidUserDescriptionException.class, () -> new UserDescription("名".repeat(101)));
    assertEquals(" 小明 ", new UserDescription(" 小明 ").displayName());
  }

  @Test
  void renameKeepsStableIdentityWithoutMutatingLoadedSnapshot() {
    User original = new User("stable-id", new UserDescription("小明"));
    User renamed = original.renameTo(new UserDescription("新名称"));
    assertEquals("stable-id", renamed.getIdentity());
    assertEquals("新名称", renamed.getDescription().displayName());
    assertEquals("小明", original.getDescription().displayName());
  }

  @Test
  void requiresAnIdentityAndDescription() {
    assertThrows(IllegalArgumentException.class, () -> new User("", new UserDescription("A")));
    assertThrows(NullPointerException.class, () -> new User("id", null));
  }
}
