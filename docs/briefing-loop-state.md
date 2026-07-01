# Briefing Genie Improvement Loop State

Last updated: 2026-07-01

This file is the durable handoff point for the Briefing Genie improvement loop. Treat the facts below as current repo state, and treat recommendations as hypotheses that need verifier review before a ship/no-ship call.

## Current Facts

- Current baseline run id: `baseline-openai-20260624203921`
- Current candidate run id: `candidate-citation-gates`
- Latest comparison artifact: `runs/comparisons/baseline-openai-20260624203921-candidate-citation-gates.json`
- Active variant under test: none selected for a generated live candidate; `candidate-citation-gates` is only a reference target
- Visible tuning cases: `case-adoption-friction`, `case-code-review-queues`, `case-cost-latency-budget`, `case-eval-loop`, `case-human-approval-boundary`, `case-incident-recovery-comms`, `case-release-note-drift`
- Holdout status: holdouts are excluded from the public/demo loop unless explicitly requested
- Verifier status: needs verifier review before any ship recommendation

## Current Evidence

- Overall quality moved from `0.90` to `0.91` in the latest OpenAI-baseline comparison.
- Citation support moved from `0.95` to `0.96`.
- Grounding risk units moved from `9` to `6`.
- Median latency moved from `10.7s` to `8.0s`.
- The latest comparison warning says this validates the artifact flow, but not live model quality improvement, because the candidate is a human-authored reference target.

## Active Product Hypothesis

None selected yet for a generated candidate. The next loop pass should inspect the current failure clusters, consider the smallest plausible variant, and choose one bounded hypothesis before changing runtime generation behavior.

## Target Failure Tags

- `partial-claim-support`
- `missing-strongest-citation`
- `citation-mismatch`
- `unsupported-claim`
- `weak-citation-support`

## Known Failure Clusters

- Partial Claim Support: medium severity across `case-adoption-friction`, `case-cost-latency-budget`, and `case-incident-recovery-comms`.
- Missing Strongest Citation: low severity on `case-adoption-friction`.
- Quantifier Too Strong: low severity on `case-adoption-friction`.
- Citation Mismatch: low severity on `case-cost-latency-budget`.

## Rejected Or Deferred Approaches

- Do not claim a model improvement from `candidate-citation-gates`; it is a reference target seeded for demo evidence.
- Do not tune against holdout cases in the default loop.
- Defer recurring live-provider automation until the manual loop is reliable.

## Next Recommended Experiment

Ask Codex to evaluate potential variants against the current failure clusters, pick the simplest generated candidate to start, run it against the smallest visible eval slice, compare it to `baseline-openai-20260624203921`, and ask a verifier to check whether the score movement justifies iteration or rejection.

## Human Decision Needed

Approve the next live-provider candidate experiment scope, including the variant-selection criteria, visible case slice, expected provider cost, and whether the first candidate should target citation discipline, coverage recovery, or another smaller change.

## Latest Automation-Friendly Triage

Last triage: 2026-07-01T16:55:50.994Z
Triage artifact: `runs/comparisons/triage/triage-20260701165550.json`
Data validation: pass - Run store fixtures validate.
Latest run: `baseline-openai-20260624203921` (complete, overall 0.90, citation 0.95)
Latest comparison: `baseline-openai-20260624203921-candidate-citation-gates` (Pipeline rehearsal)
Top failure cluster: Partial Claim Support across case-adoption-friction, case-cost-latency-budget, case-incident-recovery-comms
Recommendation: needs human review - Review the top failure cluster (Partial Claim Support) and approve a bounded matrix slice before live-provider work.
Next command: `mise exec -- bun run eval:matrix`
