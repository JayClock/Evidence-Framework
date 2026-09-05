---
name: evidence-tdd
description: Implement a local Evidence Sprint story with real Red-Green-Refactor TDD in the current repository, changing source and test files and running verification commands. Use whenever the workflow is in coding, a US-xxx story is being implemented or revised, or the user requests a TDD evidence record.
---

# Evidence TDD

Implement exactly one approved user story as a runnable increment.

## Red

1. Read the story, acceptance criteria, fulfillment-model status, architecture, API contract, DoD, and relevant existing code. When FM applies, preserve the referenced Fulfillment/Scenario semantics in executable tests.
2. Choose the smallest externally observable behavior not yet implemented.
3. Add or change a real test using the existing test framework.
4. Call `evidence_tdd_red` with a focused test command and the expected assertion/behavior failure. The extension runs the command, records a non-zero result, and returns the actual output for comparison.
5. Confirm the captured failure is caused by missing behavior—not syntax, compilation, imports, fixtures, environment, or an unrelated regression.

## Green

1. Write the smallest production change that satisfies the failing behavior.
2. Call `evidence_tdd_green`; the extension re-runs exactly the command captured at Red and requires exit code zero.
3. Run nearby tests to detect local regressions.
4. Do not implement stories or speculative abstractions outside the current US-xxx scope.

## Refactor

1. Improve names, duplication, boundaries, and readability without changing behavior.
2. Keep tests green throughout refactoring.
3. Run the configured project quality commands.
4. Inspect the final diff and remove debug output, dead code, generated artifacts, and accidental changes.

## Evidence rules

- The extension, not prose, records the actual Red and Green exit codes and bounded output.
- List every changed source and test file relative to the project root; each declaration must be dirty in Git when Git is available.
- Include at least one changed test file and one changed production source file.
- If a focused or configured quality command fails, do not claim completion; use the output/report in the next round.
- Keep Story → FM Fulfillment/Scenario → test traceability explicit when FM applies.
- Complete by calling `evidence_complete_story` with the Refactor summary as the final action.
