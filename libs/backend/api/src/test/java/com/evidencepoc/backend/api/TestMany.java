package com.evidencepoc.backend.api;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.Many;
import java.util.Iterator;
import java.util.List;

/** Test storage only; pagination decisions remain in the actual smart-domain component. */
record TestMany<E extends Entity<?, ?>>(List<E> values) implements Many<E> {
  TestMany {
    values = List.copyOf(values);
  }

  @Override
  public int size() {
    return values.size();
  }

  @Override
  public Many<E> subCollection(int from, int to) {
    return new TestMany<>(values.subList(from, to));
  }

  @Override
  public Iterator<E> iterator() {
    return values.iterator();
  }
}
