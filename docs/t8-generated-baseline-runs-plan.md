# Phase 8 Generated Baseline Runs Plan

Status: active

Parent plans:

- [t3-ux-replacement-plan.md](./t3-ux-replacement-plan.md)
- [t5-expanded-eval-set-plan.md](./t5-expanded-eval-set-plan.md)
- [t6-live-generation-orchestration-plan.md](./t6-live-generation-orchestration-plan.md)
- [t7-demo-realistic-eval-expansion-plan.md](./t7-demo-realistic-eval-expansion-plan.md)

## Objective

Move the lab from hand-authored seeded baseline artifacts toward reproducible generated baseline runs, without changing `/genie` into the source of record for eval claims.

`/genie` remains the product surface for one interactive briefing. Generated baseline runs should be created outside the product UX through a script or lab-owned runner, then read by `/lab` as file-backed run artifacts.

## Baseline Boundary

A baseline run is an experiment artifact, not a product-page click.

The baseline command should:

- use an explicit variant id, provider, model, prompt version, and generation settings
- run across a selected eval corpus, defaulting to visible non-holdout cases
- avoid reading eval-only labels during generation
- write artifacts under `runs/baseline-*`
- keep seeded Phase 5 artifacts as deterministic fallback data
- become commit-worthy only when the corpus and generated outputs are useful enough to inspect

## Required Artifacts

Each generated baseline run should write the six artifact groups needed for a credible lab story:

1. Generated briefing outputs
   - One `BriefingOutput` per selected eval case.
   - Stored under `runs/<baseline-run-id>/briefings/`.
   - Zod-validated before writing.

2. Generation traces
   - One `GenerationTrace` per selected eval case.
   - Stored under `runs/<baseline-run-id>/traces/`.
   - Include source packet path, user request, prompt/messages, model/provider metadata, cost, latency, errors, and artifact paths.

3. Evaluator outputs per case
   - One `EvaluatorOutput` per selected eval case.
   - Stored under `runs/<baseline-run-id>/evaluations/`.
   - The first implementation may use a deterministic local evaluator, but the artifact contract should allow a stronger evaluator later.

4. Run manifest
   - Stored at `runs/<baseline-run-id>/manifest.json`.
   - Include run id, timestamp, variant label, command, git ref, selected case ids, status, guardrails, and artifact paths.

5. Aggregate metrics
   - Stored in the run manifest.
   - Include overall, grounding, coverage, citation support, unsupported claim count, median latency, cost ratio, and latency ratio.

6. Comparison/report artifacts
   - Generate only when a candidate run exists or when comparing against the seeded candidate fallback intentionally.
   - Store comparison JSON under `runs/comparisons/`.
   - Refresh `reports/latest-eval-summary.md` only from validated run artifacts.

## Commands

Add repeatable commands for local demo work:

- `eval:baseline`: generate a baseline run and write all baseline artifacts.
- `eval:variant`: generate a candidate/variant run with the same artifact shape.
- `eval:report`: compare two runs and refresh comparison/report artifacts.

The commands should support explicit ids through environment variables or flags so committed demo artifacts can have stable names.

## Dashboard Behavior

The lab should prefer generated run comparisons when present and valid. If no generated comparison exists, it should continue to show the seeded Phase 5 comparison.

The dashboard should make the source of the comparison obvious:

- generated baseline versus generated candidate
- generated baseline versus seeded candidate fallback
- seeded baseline versus seeded candidate fallback

## Implementation Sequence

1. Add a non-React eval runner script that calls the shared Briefing Genie generation service.
2. Add a deterministic evaluator that produces schema-valid evaluator outputs from generated briefings and eval cases.
3. Add baseline, variant, and report package commands.
4. Write run manifests, per-case briefings, traces, evaluator outputs, comparison JSON, and summary reports atomically where practical.
5. Teach the run store to prefer generated comparisons when no explicit comparison is requested.
6. Generate the first baseline run only after the command path validates against the current 9-case corpus.
7. Decide separately whether the generated run artifacts are good enough to commit as demo evidence.

## Acceptance Criteria

- `mise exec -- bun run data:validate` passes.
- `mise exec -- bun run check:write` passes.
- `mise exec -- bun run typecheck:native` passes.
- `eval:baseline` writes a complete `runs/baseline-*` artifact set.
- Generated artifacts validate through the existing Zod schemas.
- Seeded Phase 5 artifacts remain available as fallback data.
- `/genie` does not silently persist or source baseline eval claims.
- `/lab` can read a generated comparison when one exists and fall back to seeded comparison otherwise.
