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
```

Defaults:

- `--provider=openai` defaults to `--evaluator=hybrid`
- `--provider=local` defaults to `--evaluator=deterministic`
- `--evaluator=deterministic` remains available for offline rehearsal and regression work

Use `OPENAI_EVAL_MODEL` for the judge model when set. Otherwise, default to the app OpenAI model. The run scripts should abort before live judge calls when the judge model is missing from the pricing table.

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

Old deterministic OpenAI scores should be labeled as legacy heuristic evidence or de-emphasized once hybrid evaluator artifacts exist.

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
- Deterministic eval remains useful for hard validity, cost, latency, and metadata checks.
- Live OpenAI quality claims are based on hybrid evaluator evidence and manual spot checks, not deterministic heuristics alone.
