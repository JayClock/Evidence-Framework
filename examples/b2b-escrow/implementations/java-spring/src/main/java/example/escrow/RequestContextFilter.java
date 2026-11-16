package example.escrow;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component("escrowRequestContextFilter")
public class RequestContextFilter extends OncePerRequestFilter {
  public record Context(Instant now, String role) {}

  private static final ThreadLocal<Context> CURRENT = new ThreadLocal<>();

  public static Context current() {
    return Objects.requireNonNull(CURRENT.get(), "Missing request context");
  }

  private final Environment env;
  private final ObjectMapper json;

  public RequestContextFilter(Environment env, ObjectMapper json) {
    this.env = env;
    this.json = json;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    try {
      if (!env.getProperty("escrow.test-mode", Boolean.class, false))
        throw new BusinessError(
            503, "TEST_MODE_REQUIRED", "No production identity provider in reference server");
      List<String> clocks = Collections.list(request.getHeaders("x-evidence-asof"));
      Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
      if (!clocks.isEmpty()) {
        try {
          if (clocks.size() != 1) throw new IllegalArgumentException();
          now = Money.time(clocks.getFirst());
        } catch (RuntimeException e) {
          throw new BusinessError(400, "INVALID_CLOCK", "Expected whole-second UTC timestamp");
        }
      }
      List<String> roles = Collections.list(request.getHeaders("x-evidence-role"));
      if (roles.size() != 1 || roles.getFirst().isEmpty())
        throw new BusinessError(401, "UNAUTHENTICATED", "Missing test identity");
      CURRENT.set(new Context(now, roles.getFirst()));
      chain.doFilter(request, response);
    } catch (BusinessError e) {
      response.setStatus(e.status);
      response.setContentType("application/json");
      json.writeValue(
          response.getOutputStream(), Map.of("error", e.code, "detail", e.getMessage()));
    } finally {
      CURRENT.remove();
    }
  }
}
