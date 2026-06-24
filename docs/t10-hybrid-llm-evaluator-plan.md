# Phase 10 Hybrid LLM Evaluator Plan

Status: planned

Parent plans:

- [t8-generated-baseline-runs-plan.md](./t8-generated-baseline-runs-plan.md)
- [t9-openai-provider-runbook.md](./t9-openai-provider-runbook.md)

## Objective

Move the demo quality signal from deterministic scoring heuristics to a hybrid evaluator that combines hard deterministic checks with LLM judgment.

The deterministic evaluator has reached its useful ceiling for OpenAI runs. It is still valuable for validating artifact integrity, citation ids, holdout boundaries, cost, latency, token metadata, and schema shape, but it should not remain the main quality judge for live-provider demos. OpenAI baseline artifacts that show uniform high deterministic scores should be treated as provider shakedown evidence, not as a credible quality baseline.

Phase 10 should make the Improvement Lab show actual before/after improvement with numeric scores that are traceable to claim-level evaluator evidence.

## Evaluator Model

Use a hybrid evaluator for live OpenAI runs:

- Deterministic hard checks validate things that should be objectively true.
- An OpenAI LLM judge evaluates quality questions that require judgment.
- Manual spot checks remain required for the first few live runs because LLM judges can be wrong.

The quality signal should stay numeric so the lab can continue to show trends, deltas, and improvement claims. The difference is that the score should be derived from structured claim-level and recommendation-level judgments rather than from citation-id presence and expected-term overlap alone.

## Deterministic Hard Checks

Keep deterministic checks for:

- briefing and trace schema validity
- cited source ids exist in the source packet
- no holdout leakage into public comparison output
- artifact completeness for briefings, traces, evaluations, manifests, comparisons, and reports
- latency metadata
- cost metadata
- input, cached-input, and output token metadata
- provider, model, prompt version, and model-settings metadata

Hard checks should be persisted in evaluator artifacts and displayed in the lab. Failed hard checks should cap or fail the quality score instead of being averaged away.

## LLM Judge Responsibilities

Use the LLM judge for:

- whether each claim is supported by its cited sources
- whether each claim is only partially supported or unsupported
- which cited evidence supports the claim
- what important evidence is missing
- whether the recommendation answers the user task
- whether the recommendation overstates certainty
- whether the output handles source disagreement and caveats appropriately
- concise failure tags and explanations that a reviewer can inspect

The judge prompt must receive only the source packet, user task, generated briefing, cited source ids, and hard-check results. It must not receive eval-only labels such as `expectedCoverage`, `traps`, `acceptedCitations`, or holdout tuning notes.

## Artifact Shape

Extend `EvaluatorOutput` backward-compatibly with optional hybrid fields:

- `evaluator`: mode, provider, model, prompt version, settings, latency, token usage, cached-token usage, estimated judge cost, and pricing metadata when available
- `hardChecks[]`: id, label, status, value, threshold or expectation, and note
- `claimJudgments[]`: claim text, cited source ids, support status, supporting evidence ids, missing evidence, explanation, and failure tags
- `recommendationJudgment`: task-answer status, overconfidence status, missing important evidence, explanation, and failure tags

Keep the existing `scores` fields for compatibility:

- `overall`
- `grounding`
- `coverage`
- `citationSupport`

For hybrid runs, compute those scores from the LLM judgments plus deterministic hard-check caps or penalties. For deterministic-only runs, keep the existing local heuristic path.

## CLI Behavior

Add an evaluator option:

```bash
mise exec -- bun run eval:baseline --provider=openai --evaluator=hybrid
mise exec -- bun run eval:variant --provider=openai --evaluator=hybrid
mise exec -- bun run eval:rejudge --run-id=<existing-run-id> --evaluator=hybrid
```

Defaults:

- `--provider=openai` defaults to `--evaluator=hybrid`
- `--provider=local` defaults to `--evaluator=deterministic`
- `--evaluator=deterministic` remains available for offline rehearsal and regression work

Use `OPENAI_EVAL_MODEL` for the judge model when set. Otherwise, default to the dedicated evaluator model, currently `gpt-5.5`, so generation baselines can remain pinned separately from judge quality. The run scripts should abort before live judge calls when the judge model is missing from the pricing table.

Use `eval:rejudge` when evaluator policy or judge model changes but the generated briefings and traces should stay fixed. Rejudge mode should reuse the existing run's briefing and trace artifacts, rewrite only evaluator outputs plus aggregate manifest metrics, and refresh the comparison/report for that run.

The `/lab` action button may start a local background CLI process for demo convenience, but that is not production-grade job infrastructure. The API should return immediately and poll run status from manifests/artifacts, but a real hosted version would need a worker queue, durable job records, cancellation, retries, and process recovery instead of relying on an in-memory job map inside the web server.

## Holdout Scope

Holdout cases are not part of the current Phase 10 demo loop.

- `/genie` should continue to exclude holdout cases from product-facing selectors and generation flows.
- `/lab` should continue to hide holdout case details from the public/demo surface. If a comparison includes holdout case ids, public-safe outputs must redact holdout-influenced aggregate metrics, target gaps, artifact paths, and featured-case details.
- Default CLI runs should continue to use the visible non-holdout corpus. `--include-holdouts` is an explicit private validation mode, not a demo default.
- Do not use holdout scores to tune prompts, pick demo variants, or explain demo improvements in the primary lab UI.
- Treat holdouts as future/private regression evidence: after a candidate looks good on visible cases, an internal run can include holdouts to check whether the improvement generalizes and whether prompt/model iteration overfit the visible examples.

If Phase 10 does not add an authenticated/internal holdout results view, holdouts are effectively stored infrastructure only. That is acceptable for this phase, but the plan should not imply that `/genie`, the public `/lab` dashboard, or default demo scripts actively use holdout data.

## Scoring Guidance

For hybrid runs:

- `citationSupport` should reflect claim-level support judgments, not merely whether citation ids exist.
- `grounding` should reflect whether claims are supported by cited evidence and whether important caveats are missing.
- `coverage` should reflect whether the output answers the user task and includes important evidence.
- `overall` should combine grounding, coverage, recommendation quality, and hard-check status.

Scores should not be tuned to make every OpenAI output look good. A credible baseline should have visible room for improvement, and candidate gains should be backed by concrete claim-level evidence.

## Lab Display

Update `/lab` so reviewers can see:

- evaluator mode and judge model
- deterministic hard-check pass, warn, and fail states
- numeric hybrid scores and deltas
- claim-level support judgments
- missing evidence and unsupported-claim explanations
- recommendation judgment, including overconfidence and task-answer quality
- evaluator cost and latency metadata separate from product generation cost
- a curated variant progression in Run Score Trend that avoids overwhelming the demo audience

Old deterministic OpenAI scores should be labeled as legacy heuristic evidence or de-emphasized once hybrid evaluator artifacts exist.

### Variant Progression Display

Once generated candidate variants exist, keep the primary Run Score Trend focused on a small set of demo-relevant anchors instead of every historical run:

- With no generated candidate variants, show `Baseline -> Reference Target`.
- With one generated candidate variant, show `Baseline -> Latest Variant -> Reference Target`.
- With multiple generated candidate variants, show `Baseline -> Best Previous -> Latest Variant -> Reference Target`.
- If the latest variant is also the best previous variant, omit the duplicate and show `Baseline -> Latest Variant -> Reference Target`.

Define `Latest Variant` as the newest completed generated candidate run for the active case set. Define `Best Previous` conservatively as the earlier completed generated candidate with the highest overall score, using lower grounding risk units, lower median latency, and newer run timestamp as tie-breakers. Keep full variant history available later through a secondary history/debug surface, not the primary demo chart.

## Manual Spot Check

For the first live hybrid baseline and candidate pair:

- inspect at least three visible cases
- verify that cited evidence actually supports the judged claims
- verify that unsupported and partially supported claims are reasonable
- verify that missing-evidence findings are grounded in the source packet
- verify that overconfidence findings are not merely style preferences
- confirm the lab score delta matches the visible claim-level evidence

Do not claim product or prompt improvement until the manual spot check supports the hybrid evaluator findings.

## Implementation Steps

1. Split deterministic evaluator logic out of `scripts/run-eval.ts` into a reusable evaluator module.
2. Add deterministic hard-check output and persist it in evaluator artifacts.
3. Add a structured OpenAI judge path validated by Zod.
4. Add `--evaluator=deterministic|hybrid` and default evaluator selection by provider.
5. Compute hybrid scores from LLM judgments with deterministic hard-check caps.
6. Update comparison and report labels to distinguish hybrid LLM judge evidence from legacy deterministic heuristic evidence.
7. Update `/lab` to show evaluator metadata, hard checks, claim judgments, and recommendation judgments.
8. Re-run the OpenAI baseline and candidate after hybrid eval lands.
9. Add curated variant progression support for Run Score Trend: baseline, latest variant, reference target, and best previous only when it adds a distinct comparison point.
10. Add a rejudge command for rerunning the evaluator against existing generated artifacts when judge model or scoring policy changes.
11. Keep holdout cases out of the current demo loop unless a private/internal validation surface is explicitly added.

## Test Plan

- Add mocked hybrid evaluator tests for supported, partially supported, unsupported, missing-evidence, and overconfident-recommendation cases.
- Add a prompt-boundary test proving eval-only labels are not sent to the LLM judge.
- Keep existing fixture validation backward-compatible.
- Run:

```bash
mise exec -- bun run check:write
mise exec -- bun run typecheck:native
mise exec -- bun run data:validate
```

## Acceptance Criteria

- A new OpenAI baseline no longer shows uniform deterministic `0.95` overall scores and `1.00` citation scores across all cases.
- `/lab` shows numeric quality improvement plus claim-level evidence explaining the delta.
- `/lab` keeps the primary Run Score Trend readable by showing at most baseline, best previous, latest variant, and reference target, with no duplicate best/latest bar.
- Holdout behavior is explicit: current `/genie`, public `/lab`, and default scripts do not actively use holdouts; `--include-holdouts` is reserved for private validation and must not leak aggregate target deltas or case details through public-safe endpoints.
- Deterministic eval remains useful for hard validity, cost, latency, and metadata checks.
- Live OpenAI quality claims are based on hybrid evaluator evidence and manual spot checks, not deterministic heuristics alone.
