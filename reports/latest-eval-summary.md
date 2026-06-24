# Latest Eval Summary

Generated comparison: OpenAI baseline `baseline-openai-20260623165128` vs Reference target `candidate-citation-gates`.

| Metric | OpenAI baseline | Reference target | Gap |
| --- | --- | --- | --- |
| Overall score | 0.89 | 0.90 | +0.01 |
| Citation support | 0.96 | 0.96 | +0.00 |
| Coverage | 0.92 | 0.93 | +0.01 |
| Grounding risk units | 10 | 6 | -4 |
| Eval cases | 7 | 7 | 0 |
| Median latency | 12.6s | 8.0s | -4.6s |
| Estimated cost | 0.07009975 | <= 0.1 | -0.02990025 |

Featured case: `case-adoption-friction` - Developer adoption friction briefing.

Comparison uses file-backed artifacts for the same eval case so the before/after story is inspectable.

## Failure Clusters

- Overconfidence: 4 cases (case-adoption-friction, case-cost-latency-budget, case-human-approval-boundary, case-release-note-drift)
- Partial Claim Support: 3 cases (case-adoption-friction, case-eval-loop, case-release-note-drift)
- Causal Overstatement: 1 cases (case-adoption-friction)
- Minor Unsupported Implementation Detail: 1 cases (case-adoption-friction)

## Evidence Status

This comparison uses OpenAI baseline and a human-authored Reference target. It validates the eval artifact flow, but not live model quality improvement.

Run a generated candidate before using this as improvement evidence.
