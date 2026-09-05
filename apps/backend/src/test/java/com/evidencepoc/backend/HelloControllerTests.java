package com.evidencepoc.backend;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class HelloControllerTests {

    private final HelloController controller = new HelloController();

    @Test
    void returnsBackendGreeting() {
        HelloController.HelloResponse response = controller.hello();

        assertEquals("Hello from Spring Boot!", response.message());
        assertEquals("backend", response.service());
    }
}
