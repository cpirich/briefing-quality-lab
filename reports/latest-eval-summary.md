# Latest Eval Summary

Generated comparison: OpenAI baseline `baseline-openai-20260624203921` vs Reference target `candidate-citation-gates`.

| Metric | OpenAI baseline | Reference target | Gap |
| --- | --- | --- | --- |
| Overall score | 0.90 | 0.91 | +0.01 |
| Citation support | 0.95 | 0.96 | +0.01 |
| Coverage | 0.95 | 0.93 | -0.02 |
| Grounding risk units | 9 | 6 | -3 |
| Eval cases | 7 | 7 | 0 |
| Median latency | 10.7s | 8.0s | -2.7s |
| Estimated cost | 0.06721575 | <= 0.1 | -0.03278425 |

Featured case: `case-adoption-friction` - Developer adoption friction briefing.

Comparison uses file-backed artifacts for the same eval case so the before/after story is inspectable.

## Failure Clusters

- Partial Claim Support: 3 cases (case-adoption-friction, case-cost-latency-budget, case-incident-recovery-comms)
- Missing Strongest Citation: 1 cases (case-adoption-friction)
- Quantifier Too Strong: 1 cases (case-adoption-friction)
- Citation Mismatch: 1 cases (case-cost-latency-budget)

## Evidence Status

This comparison uses OpenAI baseline and a human-authored Reference target. It validates the eval artifact flow, but not live model quality improvement.

Run a generated candidate before using this as improvement evidence.
