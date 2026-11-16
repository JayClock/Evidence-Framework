# Small acceptance-model fixtures

These procurement / additive-deposit bundles are intentionally minimal inputs
for trace hashes, story projection, CLI parsing and export unit tests. They were
moved out of `examples/acceptance/` when the real HTTP SUT migrated to the B2B
escrow example. They are **not** runnable backend examples or production
contracts. Keep them small so unrelated framework tests do not depend on the
large engineering example's exact scene names or business values.

Real HTTP acceptance and governance now use `examples/b2b-escrow/` and its
independent Fastify service. No compatibility backend or old generated suite is
retained here.
