# Latest Eval Summary

Generated comparison: OpenAI baseline `baseline-openai-20260623165128` vs Reference target `candidate-citation-gates`.

| Metric | OpenAI baseline | Reference target | Gap |
| --- | --- | --- | --- |
| Overall score | 0.87 | 0.88 | +0.01 |
| Citation support | 0.97 | 0.95 | -0.02 |
| Coverage | 0.85 | 0.88 | +0.03 |
| Grounding risk units | 9 | 6 | -3 |
| Eval cases | 7 | 7 | 0 |
| Median latency | 12.6s | 8.0s | -4.6s |
| Estimated cost | 0.07009975 | <= 0.1 | -0.02990025 |

Featured case: `case-adoption-friction` - Developer adoption friction briefing.

Comparison uses file-backed artifacts for the same eval case so the before/after story is inspectable.

## Failure Clusters

- Overconfidence: 2 cases (case-adoption-friction, case-release-note-drift)
- Partial Claim Support: 2 cases (case-adoption-friction, case-release-note-drift)
- Causality Overreach: 1 cases (case-adoption-friction)
- Coverage Gap: 1 cases (case-adoption-friction)

## Evidence Status

This comparison uses OpenAI baseline and a human-authored Reference target. It validates the eval artifact flow, but not live model quality improvement.

Run a generated candidate before using this as improvement evidence.
