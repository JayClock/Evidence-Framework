# Check fixtures

The models the validation suites are tested against. They are the golden
standard for the native checks: a change to the CEL evaluator, the scope
selector, the simulator or the FM report shows up here first.

| Fixture                                                                     | Why it exists                                                  |
| --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`models/valid-traceable-subscription/`](models/valid-traceable-subscription) | Six instances, three scenarios, two derivation chains and one key data decision still owed. Every report contract is pinned against it. |
| [`invalid-missing-confirmation/`](invalid-missing-confirmation)              | A model that is consistent but incomplete: a Fulfillment Request with no confirmation and a Contract Party holding no request. |

These trees were copied out of the `evidence-fm` skill package when the Python
checkers retired, so the suites that read them no longer depend on a skill
install. Other packages in the workspace read them by relative path rather than
keeping a second copy — one golden fixture, one place to refresh it.

Rules for this directory:

- keep the on-disk layout identical to a real `.evidence/fm/` tree, so
  `readModelRoot` reads it exactly as it reads a project;
- never hand-edit a fixture to make a test pass — clone it and mutate the clone;
- refresh deliberately, and re-pin any digest the tests assert.
