# Latest Eval Summary

Generated comparison: Generated baseline `baseline-local-20260622-160000` vs Reference target `candidate-citation-gates`.

| Metric | Generated baseline | Reference target | Gap |
| --- | --- | --- | --- |
| Overall score | 0.65 | 0.83 | +0.18 |
| Citation support | 0.68 | 0.80 | +0.12 |
| Unsupported claims | 14 | 7 | -7 |
| Eval cases | 7 | 7 | 0 |
| Median latency | 0.0s | 7.9s | 7.9s |
| Cost ratio | 1.00x | 1.10x | +0.10x |

Featured case: `case-adoption-friction` - Developer adoption friction briefing.

Comparison uses file-backed artifacts for the same eval case so the before/after story is inspectable.

## Failure Clusters

- Citation Grounding: 2 cases (case-adoption-friction, case-eval-loop)
- Cost Guardrail: 2 cases (case-cost-latency-budget, case-eval-loop)
- Human Approval: 2 cases (case-human-approval-boundary, case-release-note-drift)
- Stale Source: 2 cases (case-incident-recovery-comms, case-release-note-drift)

## Evidence Status

This comparison uses Generated baseline and a human-authored Reference target. It validates the eval artifact flow, but not live model quality improvement.

Run a generated candidate before using this as improvement evidence.
