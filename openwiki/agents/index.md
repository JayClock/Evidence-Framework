# Files

- [External agents over MCP](mcp-integration.md) - How external IDEs and CLI agents read and mutate the live Evidence model through an MCP tool surface, a stdio process and a per-user local socket bridge.
- [The Pi agent harness and its tools](pi-harness.md) - How an in-process Pi session is narrowed behind an injectable port, given modeling instructions and a fixed tool set, and how its patches and sensor runs travel back through the desktop renderer.
- [Sensors, stage gate and the dependency frontier](sensor-orchestration.md) - How one in-process sensor run folds consistency, key data, trace and scenario results into a severity-ranked verdict, how the gate decides downstream hand-off from saved evidence, and how interview and branch comparisons avoid treating silence as agreement.
