# Check fixtures

The models the validation suites are tested against. They are the golden
standard for the native checks: a change to the CEL evaluator, the scope
selector, the simulator or the FM report shows up here first.

| Fixture                                                                     | Why it exists                                                  |
| --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`models/valid-traceable-subscription/`](models/valid-traceable-subscription) | Six instances, three scenarios, two derivation chains and one key data decision still owed. Every report contract is pinned against it. |
| [`invalid-missing-confirmation/`](invalid-missing-confirmation)              | A model that is consistent but incomplete: a Fulfillment Request with no confirmation and a Contract Party holding no request. |

These trees live in the workspace instead of inside a skill install, so the
suites that read them do not depend on one. Other packages read them by relative
path rather than keeping a second copy — one golden fixture, one place to
refresh it.

Rules for this directory:

- keep the on-disk layout identical to a real `.evidence/fm/` tree, so
  `readModelRoot` reads it exactly as it reads a project;
- never hand-edit a fixture to make a test pass — clone it and mutate the clone;
- refresh deliberately, and re-pin any digest the tests assert.
