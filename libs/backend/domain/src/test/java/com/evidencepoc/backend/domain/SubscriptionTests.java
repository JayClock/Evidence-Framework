package com.evidencepoc.backend.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.evidencepoc.backend.domain.context.SubscriptionContext;
import com.evidencepoc.backend.domain.description.SubscriptionDescription;
import com.evidencepoc.backend.domain.description.UserDescription;
import com.evidencepoc.backend.domain.model.Subscription;
import com.evidencepoc.backend.domain.model.Subscriptions;
import com.evidencepoc.backend.domain.model.User;
import com.evidencepoc.backend.domain.role.Reader;
import io.github.jayclock.smartdomain.core.Many;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class SubscriptionTests {
  private static final String SUBSCRIPTION_ID = "SUB-20261001-001";
  private static final Instant SIGNED_AT = Instant.parse("2026-10-01T09:00:00Z");

  @Test
  void registersAllElevenFrozenFieldsThroughTheReaderOwnedCollection() {
    InMemorySubscriptions subscriptions = new InMemorySubscriptions();
    Reader reader = context(subscriptions).asReader(readerUser());
    SubscriptionDescription description = validDescription();

    Subscription registered = reader.registerSubscription(SUBSCRIPTION_ID, description);

    assertEquals(SUBSCRIPTION_ID, registered.getIdentity());
    assertSame(description, registered.getDescription());
    assertEquals("READER-001", description.readerId());
    assertEquals("COL-BM", description.columnId());
    assertEquals("ED-1", description.editionId());
    assertEquals(9900, description.amountMinorUnits());
    assertEquals("CNY", description.currency());
    assertEquals(SIGNED_AT, description.signedAt());
    assertEquals(900, description.paymentSeconds());
    assertEquals(60, description.accessSeconds());
    assertEquals(604800, description.refundSeconds());
    assertEquals(86400, description.restoreSeconds());
    assertSame(registered, subscriptions.findByIdentity(SUBSCRIPTION_ID).orElseThrow());
    assertSame(subscriptions, reader.subscriptions());
  }

  @Test
  void rejectsEveryMissingRequiredFieldWithoutChangingTheCollection() {
    InMemorySubscriptions subscriptions = new InMemorySubscriptions();
    Reader reader = context(subscriptions).asReader(readerUser());

    assertRejected(subscriptions, () -> reader.registerSubscription(null, validDescription()));
    assertRejected(
        subscriptions,
        () -> description(null, "COL-BM", "ED-1", 9900, "CNY", SIGNED_AT, 900, 60, 604800, 86400));
    assertRejected(
        subscriptions,
        () ->
            description(
                "READER-001", null, "ED-1", 9900, "CNY", SIGNED_AT, 900, 60, 604800, 86400));
    assertRejected(
        subscriptions,
        () ->
            description(
                "READER-001", "COL-BM", null, 9900, "CNY", SIGNED_AT, 900, 60, 604800, 86400));
    assertRejected(
        subscriptions,
        () ->
            description(
                "READER-001", "COL-BM", "ED-1", 0, "CNY", SIGNED_AT, 900, 60, 604800, 86400));
    assertRejected(
        subscriptions,
        () ->
            description(
                "READER-001", "COL-BM", "ED-1", 9900, null, SIGNED_AT, 900, 60, 604800, 86400));
    assertRejected(
        subscriptions,
        () ->
            description("READER-001", "COL-BM", "ED-1", 9900, "CNY", null, 900, 60, 604800, 86400));
    assertRejected(
        subscriptions,
        () ->
            description(
                "READER-001", "COL-BM", "ED-1", 9900, "CNY", SIGNED_AT, 0, 60, 604800, 86400));
    assertRejected(
        subscriptions,
        () ->
            description(
                "READER-001", "COL-BM", "ED-1", 9900, "CNY", SIGNED_AT, 900, 0, 604800, 86400));
    assertRejected(
        subscriptions,
        () ->
            description("READER-001", "COL-BM", "ED-1", 9900, "CNY", SIGNED_AT, 900, 60, 0, 86400));
    assertRejected(
        subscriptions,
        () ->
            description(
                "READER-001", "COL-BM", "ED-1", 9900, "CNY", SIGNED_AT, 900, 60, 604800, 0));
  }

  @Test
  void rejectsReaderMismatchAndDuplicateIdentityWithoutReplacingFrozenFacts() {
    InMemorySubscriptions subscriptions = new InMemorySubscriptions();
    Reader reader = context(subscriptions).asReader(readerUser());
    Subscription original = reader.registerSubscription(SUBSCRIPTION_ID, validDescription());

    SubscriptionDescription conflicting =
        description(
            "READER-001",
            "COL-BM",
            "ED-2",
            12000,
            "CNY",
            SIGNED_AT.plusSeconds(1),
            1200,
            90,
            700000,
            90000);

    assertThrows(
        IllegalStateException.class,
        () -> reader.registerSubscription(SUBSCRIPTION_ID, conflicting));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            reader.registerSubscription(
                "SUB-OTHER",
                description(
                    "OTHER", "COL-BM", "ED-1", 9900, "CNY", SIGNED_AT, 900, 60, 604800, 86400)));

    assertEquals(1, subscriptions.findAll().size());
    assertSame(original, subscriptions.findByIdentity(SUBSCRIPTION_ID).orElseThrow());
    assertEquals(validDescription(), original.getDescription());
  }

  @Test
  void rejectsBlankTextAndNegativeCommercialValues() {
    assertThrows(
        IllegalArgumentException.class,
        () -> description(" ", "COL-BM", "ED-1", 9900, "CNY", SIGNED_AT, 900, 60, 604800, 86400));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            description(
                "READER-001", "COL-BM", "ED-1", -1, "CNY", SIGNED_AT, 900, 60, 604800, 86400));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            description(
                "READER-001", "COL-BM", "ED-1", 9900, "CNY", SIGNED_AT, -1, 60, 604800, 86400));
  }

  private static void assertRejected(InMemorySubscriptions subscriptions, Runnable action) {
    assertThrows(RuntimeException.class, action::run);
    assertEquals(0, subscriptions.findAll().size());
  }

  private static SubscriptionContext context(Subscriptions subscriptions) {
    return user -> {
      if (user == null) {
        throw new IllegalArgumentException("User is required to switch into role.reader");
      }
      return new Reader(user, subscriptions);
    };
  }

  private static User readerUser() {
    return new User("READER-001", new UserDescription("读者"));
  }

  private static SubscriptionDescription validDescription() {
    return description(
        "READER-001", "COL-BM", "ED-1", 9900, "CNY", SIGNED_AT, 900, 60, 604800, 86400);
  }

  private static SubscriptionDescription description(
      String readerId,
      String columnId,
      String editionId,
      long amountMinorUnits,
      String currency,
      Instant signedAt,
      long paymentSeconds,
      long accessSeconds,
      long refundSeconds,
      long restoreSeconds) {
    return new SubscriptionDescription(
        readerId,
        columnId,
        editionId,
        amountMinorUnits,
        currency,
        signedAt,
        paymentSeconds,
        accessSeconds,
        refundSeconds,
        restoreSeconds);
  }

  private static final class InMemorySubscriptions implements Subscriptions {
    private final LinkedHashMap<String, Subscription> subscriptions = new LinkedHashMap<>();

    @Override
    public Subscription register(String identity, SubscriptionDescription description) {
      Subscription subscription = new Subscription(identity, description);
      if (subscriptions.containsKey(identity)) {
        throw new IllegalStateException("Subscription already exists: " + identity);
      }
      subscriptions.put(identity, subscription);
      return subscription;
    }

    @Override
    public Many<Subscription> findAll() {
      return new SubscriptionMany(new ArrayList<>(subscriptions.values()));
    }

    @Override
    public Optional<Subscription> findByIdentity(String identifier) {
      return Optional.ofNullable(subscriptions.get(identifier));
    }
  }

  private record SubscriptionMany(List<Subscription> values) implements Many<Subscription> {
    @Override
    public int size() {
      return values.size();
    }

    @Override
    public Many<Subscription> subCollection(int from, int to) {
      return new SubscriptionMany(List.copyOf(values.subList(from, to)));
    }

    @Override
    public java.util.Iterator<Subscription> iterator() {
      return values.iterator();
    }
  }
}
