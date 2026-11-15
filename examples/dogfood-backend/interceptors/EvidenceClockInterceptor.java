package com.evidence.acceptance;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/** Request attributes also survive servlet async dispatch; no ThreadLocal leaks. */
@Component
public final class EvidenceClockInterceptor implements HandlerInterceptor {
    private static final String CLOCK = EvidenceClockInterceptor.class.getName() + ".clock";
    private final boolean enabled;

    public EvidenceClockInterceptor(@Value("${evidence.acceptance-clock:false}") boolean enabled) {
        this.enabled = enabled;
    }

    public static Instant now(HttpServletRequest request) {
        Object value = request.getAttribute(CLOCK);
        return value instanceof Instant ? (Instant) value : Instant.now();
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String header = request.getHeader("x-evidence-asof");
        if (enabled && header != null && header.endsWith("Z")) {
            try {
                request.setAttribute(CLOCK, Instant.parse(header));
            } catch (DateTimeParseException ignored) {
                request.removeAttribute(CLOCK);
            }
        }
        return true;
    }
}
