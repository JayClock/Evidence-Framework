package example.escrow;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import java.util.*;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class Application {
  @Bean
  Jackson2ObjectMapperBuilderCustomizer strictJson() {
    return builder ->
        builder.featuresToEnable(
            DeserializationFeature.USE_BIG_INTEGER_FOR_INTS,
            DeserializationFeature.FAIL_ON_TRAILING_TOKENS,
            JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
  }

  public static void main(String[] args) {
    try {
      Map<String, String> options =
          new HashMap<>(Map.of("port", "8082", "mode", "v2", "fault", "none"));
      boolean testMode = false;
      for (int i = 0; i < args.length; i++) {
        String arg = args[i];
        if (arg.equals("--test-mode")) {
          if (testMode) throw new IllegalArgumentException("Duplicate --test-mode");
          testMode = true;
          continue;
        }
        if (!arg.startsWith("--")) throw new IllegalArgumentException("Unknown argument " + arg);
        String[] pair = arg.substring(2).split("=", 2);
        if (!options.containsKey(pair[0]))
          throw new IllegalArgumentException("Unknown option " + arg);
        String value = pair.length == 2 ? pair[1] : args[++i];
        options.put(pair[0], value);
      }
      int port = Integer.parseInt(options.get("port"));
      if (!testMode
          || port < 0
          || port > 65535
          || !Set.of("v1", "v2").contains(options.get("mode"))
          || !options.get("fault").equals("none"))
        throw new IllegalArgumentException(
            "Requires --test-mode, valid --port, --mode v1|v2, --fault none");
      SpringApplication app = new SpringApplication(Application.class);
      app.setDefaultProperties(
          Map.of(
              "server.address",
              "127.0.0.1",
              "server.port",
              port,
              "escrow.test-mode",
              true,
              "escrow.mode",
              options.get("mode"),
              "spring.main.banner-mode",
              "off",
              "logging.level.root",
              "WARN"));
      var context = app.run();
      int actual =
          ((org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext)
                  context)
              .getWebServer()
              .getPort();
      System.out.println("{\"host\":\"http://127.0.0.1:" + actual + "\"}");
    } catch (Exception e) {
      System.err.println(e.getMessage());
      System.exit(1);
    }
  }
}
