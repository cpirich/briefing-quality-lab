# Latest Eval Summary

This synthetic report compares `baseline-2026-06-10` with `candidate-citation-gates` on the expanded Phase 5 demo corpus.

The dataset now contains 9 synthetic eval cases: 7 visible cases for demo walkthroughs and 2 holdout cases that stay out of the Genie product flow. Source packets now include 3-6 richer documents with distractors, overlapping evidence, caveats, and explicit citation traps.

The candidate improves overall quality from `0.66` to `0.83` and citation support from `0.51` to `0.80`. Grounding risk units drop from `26` to `7`, while cost stays inside the `1.15x` guardrail at `1.10x`.

Featured case: `case-release-note-drift`. The baseline recommends publishing generated release notes because coverage is high. The candidate keeps the automation benefit but gates publication on stale-claim drift review and explicit approval for sensitive customer-facing statements.
