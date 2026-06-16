# Latest Eval Summary

This synthetic report compares `baseline-2026-06-10` with `candidate-citation-gates`.

The candidate improves overall quality from `0.72` to `0.84` and citation support from `0.59` to `0.78`. The largest remaining watch item is cost: the candidate stays inside the `1.15x` guardrail at `1.08x`, but trace depth and retry behavior should remain visible in the next run.

Featured case: `case-eval-loop`. The baseline recommended expanding automated evals based on coverage alone. The candidate keeps the expansion recommendation but gates it on citation support, matching the source note that coverage can improve while grounding regresses.
