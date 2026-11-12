# Files

- [The native check and simulation pipeline](checks-and-simulation.md) - What one FM check actually proves — static consistency, scope completeness, CEL evaluation, scenario truth, evidence ordering and lineage — and how the report, digest and downstream readiness contract fit together.
- [Commands, guards and the model session](commands-and-session.md) - The only sanctioned way to change an Evidence model — immutable commands with inverses, guards that encode the modeling red lines, patch decoding, and a session that gives every edit one undo step and one change event.
- [Source tree and bundle adapters](source-formats.md) - How one DomainModelDocument is read from and written to either a .evidence/fm tree or a single *.evidence.json bundle, and the round-trip, no-churn and digest rules that make the two forms interchangeable.
