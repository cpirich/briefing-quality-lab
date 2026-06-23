# Latest Eval Summary

Generated comparison: OpenAI baseline `baseline-openai-20260623165128` vs Reference target `candidate-citation-gates`.

| Metric | OpenAI baseline | Reference target | Gap |
| --- | --- | --- | --- |
| Overall score | 0.80 | 0.83 | +0.03 |
| Citation support | 0.89 | 0.80 | -0.09 |
| Grounding risk units | 11 | 7 | -4 |
| Eval cases | 7 | 7 | 0 |
| Median latency | 12.6s | 7.9s | -4.7s |
| Estimated cost | $0.0701 | <= $0.1000 | $0.0299 under budget |

Featured case: `case-adoption-friction` - Developer adoption friction briefing.

Comparison uses file-backed artifacts for the same eval case so the before/after story is inspectable.

## Failure Clusters

- Coverage Gap: 2 cases (case-adoption-friction, case-eval-loop)
- Overconfidence: 2 cases (case-adoption-friction, case-release-note-drift)
- Partial Claim Support: 2 cases (case-adoption-friction, case-release-note-drift)
- Causality Overreach: 1 cases (case-adoption-friction)

## Evidence Status

This comparison uses OpenAI baseline and a human-authored Reference target. It validates the eval artifact flow, but not live model quality improvement.

Run a generated candidate before using this as improvement evidence.
