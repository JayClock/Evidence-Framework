package com.evidencepoc.backend.domain.model;

/** confirmation.customer-contact-record#channel: the two channels recognized by the current FM. */
public enum ContactChannel {
  PHONE("phone"),
  EMAIL("email");

  private final String value;

  ContactChannel(String value) {
    this.value = value;
  }

  public String value() {
    return value;
  }

  public static ContactChannel fromValue(String value) {
    for (ContactChannel channel : values()) {
      if (channel.value.equals(value)) {
        return channel;
      }
    }
    throw new IllegalArgumentException("Unknown contact channel: " + value);
  }
}
