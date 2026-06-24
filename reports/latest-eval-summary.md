# Latest Eval Summary

Generated comparison: OpenAI baseline `baseline-openai-20260623165128` vs OpenAI candidate `candidate-openai-demo-variant`.

| Metric | OpenAI baseline | OpenAI candidate | Delta vs baseline | Reference target | Gap to target |
| --- | --- | --- | --- | --- | --- |
| Overall score | 0.89 | 0.91 | +0.02 | 0.90 | -0.01 |
| Citation support | 0.96 | 0.99 | +0.03 | 0.96 | -0.03 |
| Coverage | 0.92 | 0.96 | +0.04 | 0.93 | -0.03 |
| Grounding risk units | 10 | 5 | -5 | 6 | -1 |
| Eval cases | 7 | 7 | 0 | 7 | 0 |
| Median latency | 12.6s | 7.1s | -5.5s | 8.0s | -0.9s |
| Estimated cost | 0.07009975 | 0.0295 | -0.04059975 | <= 0.1 | -0.0705 |

Featured case: `case-adoption-friction` - Developer adoption friction briefing.

Comparison uses file-backed artifacts for the same eval case so the before/after story is inspectable.

## Failure Clusters

- Overconfidence: 4 cases (case-adoption-friction, case-cost-latency-budget, case-human-approval-boundary, case-release-note-drift)
- Partial Claim Support: 3 cases (case-adoption-friction, case-eval-loop, case-release-note-drift)
- Causal Overstatement: 1 cases (case-adoption-friction)
- Minor Unsupported Implementation Detail: 1 cases (case-adoption-friction)

## Evidence Status

OpenAI baseline and OpenAI candidate are live-provider artifacts, but their quality scores come from deterministic heuristics.

Re-run both sides with --evaluator=hybrid before using this as live OpenAI quality improvement evidence.
