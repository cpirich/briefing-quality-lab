# Briefing Genie Improvement Loop State

Last updated: 2026-07-07

This file is the durable handoff point for the Briefing Genie improvement loop. Treat the facts below as current repo state, and treat recommendations as hypotheses that need verifier review before a ship/no-ship call.

## Current Facts

- Current baseline run id: `baseline-openai-20260624203921`
- Current candidate run id: `candidate-openai-20260707204311`
- Latest comparison artifact: `runs/comparisons/baseline-openai-20260624203921-candidate-openai-20260707204311.json`
- Latest live matrix artifact: `runs/comparisons/matrices/matrix-20260707204107.json`
- Active variant under test: `openai-loop-v5-citation-pairing` promoted as the current generated candidate
- Visible tuning cases: `case-adoption-friction`, `case-code-review-queues`, `case-cost-latency-budget`, `case-eval-loop`, `case-human-approval-boundary`, `case-incident-recovery-comms`, `case-release-note-drift`
- Holdout status: holdouts are excluded from the public/demo loop unless explicitly requested
- Verifier status: pass for demo ship; hybrid evaluator artifacts show zero candidate failure tags, zero unsupported claims, and zero partial-support claim judgments across all 7 visible cases

## Current Evidence

- Overall quality moved from `0.90` to `0.91` in the latest OpenAI-baseline comparison.
- Citation support moved from `0.95` to `0.96`.
- Grounding risk units moved from `9` to `6`.
- Median latency moved from `10.7s` to `8.0s`.
- The latest comparison warning says this validates the artifact flow, but not live model quality improvement, because the candidate is a human-authored reference target.
- Live matrix `matrix-20260707203251` tested `openai-loop-v3-claim-planning` against `openai-responses-v1` on the visible partial-support slice: `case-adoption-friction`, `case-cost-latency-budget`, and `case-incident-recovery-comms`.
- Live matrix bounds were 2 variants x 3 visible cases, holdouts excluded, retry cap `1`, estimated max generation cost `$0.110768`, and actual generation cost `$0.028273` for the candidate slice.
- The candidate improved citation support to `1.00` and kept unsupported claims at `0`, but overall quality fell to `0.87` versus `0.91` for the matrix baseline branch, and coverage fell to `0.79` versus `0.95`.
- The deciding regression was `case-adoption-friction`: candidate overall `0.73`, coverage `0.44`, with evaluator tags `coverage-gap` and `missing-important-evidence`.
- Post-run data validation passed with 5 run manifests, 27 briefing outputs, 20 traces, 27 evaluator outputs, 1 focused matrix, and 3 variant specs.
- Live matrix `matrix-20260707203645` tested `openai-loop-v4-coverage-anchors` against `openai-responses-v1` on the same visible partial-support slice.
- Live matrix bounds were 2 variants x 3 visible cases, holdouts excluded, retry cap `1`, estimated max generation cost `$0.110768`, and actual generation cost `$0.02709875` for the candidate slice.
- The v4 candidate fixed the adoption-friction coverage failure (`0.95` overall, `1.00` coverage, `1.00` citation support) but lost the focused slice overall: candidate overall `0.89` versus matrix baseline branch `0.93`, grounding `0.81` versus `0.85`, and citation support `0.94` versus `0.97`.
- The deciding regression was `case-incident-recovery-comms`: candidate overall `0.81`, grounding `0.69`, citation support `0.82`, with evaluator tags `partial-claim-support`, `citation-mismatch`, `judge-uncited-supporting-evidence`, and `overstated-inference`.
- Post-run data validation passed with 7 run manifests, 33 briefing outputs, 26 traces, 33 evaluator outputs, 2 focused matrices, and 4 variant specs.
- Live matrix `matrix-20260707204107` tested `openai-loop-v5-citation-pairing` against `openai-responses-v1` on the same visible partial-support slice.
- Live matrix bounds were 2 variants x 3 visible cases, holdouts excluded, retry cap `1`, estimated max generation cost `$0.110768`, and actual generation cost `$0.02930375` for the candidate slice.
- The v5 candidate won the focused slice: candidate overall `0.92` versus matrix baseline branch `0.89`, grounding `0.84` versus `0.81`, coverage `0.97` versus `0.95`, citation support `0.97` versus `0.94`, and unsupported claims `0`.
- Full visible continuation `candidate-openai-20260707204311` ran all 7 visible cases against `baseline-openai-20260624203921`, with holdouts excluded. Estimated generation cost was `$0.0685965`, evaluator cost was `$0.289175`, and median latency was `10.0s`.
- Promoted comparison `runs/comparisons/baseline-openai-20260624203921-candidate-openai-20260707204311.json` is the current canonical `/lab` comparison. It shows overall quality `0.90 -> 0.95`, citation support `0.95 -> 1.00`, coverage `0.95 -> 0.99`, grounding risk units `9 -> 7`, and median latency `10.7s -> 10.0s`.
- Verifier pass over `runs/candidate-openai-20260707204311/evaluations/` found zero failure tags, zero unsupported claim judgments, and zero partially-supported claim judgments across all 7 visible cases. `case-release-note-drift` scored `0.92` overall with `1.00` citation support; the other six cases scored `0.95` overall with `1.00` citation support.
- Post-promotion data validation passed with 10 run manifests, 46 briefing outputs, 39 traces, 46 evaluator outputs, 3 run comparisons, 3 focused matrices, and 5 variant specs.

## Active Product Hypothesis

Promoted generated candidate: `openai-loop-v5-citation-pairing`.

Hypothesis tested: a citation-pairing audit layered on coverage anchors would preserve adoption-risk coverage while reducing incident-communication citation mismatch and overstated inference failures.

Result: ship. The candidate won the focused slice, completed a matching full visible run, passed the verifier sweep, and was promoted into the canonical `/lab` comparison.

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
- Reject `openai-loop-v3-claim-planning`; it traded away important coverage while only matching the baseline branch on unsupported-claim risk.
- Reject `openai-loop-v4-coverage-anchors`; it recovered adoption-friction coverage but lost grounding and citation support on incident recovery.

## Next Recommended Experiment

Ship `openai-loop-v5-citation-pairing` as the current demo-facing generated candidate. Keep `openai-loop-v3-claim-planning` and `openai-loop-v4-coverage-anchors` rejected.

## Human Decision Needed

Terminal recommendation: `ship`. Human spot-checks are still prudent before external product claims, but the loop evidence supports shipping the candidate into the demo-facing Improvement Lab comparison.

## Latest Automation-Friendly Triage

Last triage: 2026-07-07T20:44:43.879Z
Triage artifact: `runs/comparisons/triage/triage-20260707204443.json`
Data validation: pass - Run store fixtures validate.
Latest run: `candidate-openai-20260707204311` (complete, overall 0.95, citation 1.00)
Latest comparison: `baseline-openai-20260624203921-candidate-openai-20260707204311` (Promoted candidate)
Top failure cluster: none found in latest comparison
Recommendation: needs human review - Artifacts are valid, but no failure cluster is strong enough for an automatic ship recommendation.
Next command: none required for this shipped candidate

## Latest Live Provider Iteration

Iteration date: 2026-07-07
Candidate variant: `openai-loop-v5-citation-pairing`
Candidate run: `runs/candidate-openai-20260707204311/manifest.json`
Matrix artifact: `runs/comparisons/matrices/matrix-20260707204107.json`
Dry-run gate: pass - 2 variants x 3 visible cases, holdouts excluded, retry cap `1`, estimated max generation cost `$0.110768`
Secret check: `.env.local` contained `OPENAI_API_KEY` by presence-only check; the key value was not printed
Live action: one OpenAI/hybrid matrix plus one candidate-only full visible continuation, no holdouts
Focused candidate cost: `$0.02930375` generation, `$0.12816` evaluator
Full candidate cost: `$0.0685965` generation, `$0.289175` evaluator
Validation after live run: pass - `mise exec -- bun run data:validate`
Promotion: pass - `mise exec -- bun run eval:promote --baseline=baseline-openai-20260624203921 --candidate-run=candidate-openai-20260707204311 --label="OpenAI loop v5 citation pairing" --source-matrix=matrix-20260707204107`
Verifier findings: hybrid evaluator artifacts show zero failure tags, zero unsupported claims, and zero partial-support judgments across the full visible candidate run
Terminal recommendation: `ship`

Previous live iteration artifacts: `runs/comparisons/matrices/matrix-20260707203251.json`, `runs/comparisons/matrices/matrix-20260707203645.json`
