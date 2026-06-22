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

## Local Scaffolding Versus Real Evidence

The local extractive generator and deterministic evaluator are scaffolding for the run pipeline.

They are useful for:

- proving that scripts can call the same generation service as `/genie`
- validating `BriefingOutput`, `GenerationTrace`, `EvaluatorOutput`, `RunManifest`, and `RunComparison` artifacts
- exercising filesystem writes, report generation, dashboard fallback behavior, and CI-friendly checks without API keys or LLM cost
- keeping a fast offline smoke-test path for local demos and future regressions

They are not enough evidence for real prompt, model, or evaluator improvement claims. A credible generated baseline should eventually use the live provider path, for example `--provider=openai`, and should be evaluated by a stronger evaluator than the deterministic local heuristic.

Keep the local mode as `provider=local`: a cheap contract test and fallback. Treat `provider=openai` or another live provider as the path for committed baseline/candidate artifacts that are meant to represent real model behavior.

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
   - The first implementation may use a deterministic local evaluator to prove the artifact flow.
   - Real improvement claims require a stronger evaluator path.

4. Run manifest
   - Stored at `runs/<baseline-run-id>/manifest.json`.
   - Include run id, timestamp, variant label, command, git ref, selected case ids, status, guardrails, and artifact paths.

5. Aggregate metrics
   - Stored in the run manifest.
   - Include overall, grounding, coverage, citation support, unsupported claim count, median latency, cost ratio, and latency ratio.

6. Comparison/report artifacts
   - Generate only when a candidate run exists or when comparing against the reference target fixture intentionally.
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
- generated baseline versus reference target fixture
- seeded baseline versus reference target fixture

Comparison charts should show the artifacts actually being compared. Avoid extra historical/reference bars unless the chart is explicitly labeled as run history; the default comparison trend should use clear labels such as `Generated baseline` and `Reference target`.

The same labels should be reused in comparison tables and featured-case diffs. Avoid mixing artifact-specific labels with generic `Baseline` and `Candidate` headings on the same screen.

The dashboard should show an evidence-status card rather than an internal next-action card. For local-provider or seeded-fallback comparisons, label the status as pipeline rehearsal and explain that the artifacts validate the eval flow but not live model quality. Promote the status only after both sides of the comparison come from live-provider generated runs and the evaluator path is credible enough for the claim being made.

When a generated run is compared with the reference target fixture, label the difference as a gap rather than an improvement delta. The reference target is a human-authored goal, not evidence that a model or prompt has improved.

The dashboard should include a per-case breakdown for the compared runs. Aggregate score cards are useful for scanning, but the lab should also show whether improvement is broad across the corpus or concentrated in a few cases. The breakdown should be driven from per-case evaluator artifacts and include case title, planned themes, baseline score, candidate or reference-target score, deltas or gaps, and evaluator artifact paths.

The dashboard should also expose a selected-case lens near the top of the page. The picker should default to a walkthrough-friendly case while making it obvious that any compared case can be inspected. The selected case should drive the case snapshot, highlighted breakdown row, case diff, and eventually selected-case artifact emphasis. The selected-case flow should move from picker and score snapshot, to full-width case breakdown, to full-width case diff as the detailed drill-down.

The selected case diff should show enough detail to support real inspection, not only a recommendation excerpt. The first pass should separate eval context from briefing content: put eval instructions/expectations, planned themes, evaluator notes, citation-support checks, and per-case artifact paths at the top, then compare briefing outputs under common headings such as title and summary, recommendation, claims and citations, and open questions. Later passes should add judge-discovered strengths, weaknesses, unsupported-claim details, and claim-level diffs once the evaluator produces those fields.

## Diagnostic Improvement Loop

The lab should evolve from a scoreboard into a diagnostic improvement loop.

Aggregate metrics answer whether a variant looks better overall. They do not explain why, where, or whether the improvement is durable. Prompt/model iteration needs per-case variation and cross-case patterns:

- cases that improved
- cases that regressed
- stable strengths that should be preserved
- repeated weaknesses that should drive prompt or model changes
- failure modes that appear only under specific packet types
- tradeoffs between grounding, coverage, cost, latency, and human-approval boundaries

Track the path from current breakdown table to an LLM-driven improvement loop:

- Extend evaluator outputs with judge-written strengths, weaknesses, missing evidence, unsupported claims, citation problems, recommendation risk, and observed failure tags.
- Compare those fields case-by-case between baseline and candidate runs.
- Cluster repeated observations across cases to form improvement hypotheses.
- Store the hypothesis or experiment note with the generated candidate run so the before/after story is explicit.
- Add regression checks that flag cases where a targeted fix improves one cluster while worsening another.
- Keep holdout cases separate so the loop can test whether the hypothesis generalizes.

## Failure Theme Reality Check

The current `/lab` failure-theme section is file-backed but not judge-discovered.

Current state:

- Eval cases carry planned `failureTags` so the corpus covers known demo failure modes.
- The deterministic evaluator copies those tags into evaluator outputs.
- The comparison report groups repeated tags into themes and lists the affected cases.
- This is useful for showing corpus coverage and validating artifact/report wiring, but it is not yet evidence that an evaluator independently found those failures in generated briefings.

Track the path to make this section judge-discovered failure analysis:

- Add evaluator rubric fields that ask the judge to identify observed failure modes from the generated briefing and cited source packet.
- Store judge-discovered failure tags separately from planned eval-case tags, for example `observedFailureTags` versus `expectedFailureTags`.
- Preserve planned tags as corpus metadata, but do not present them as findings.
- Cluster failure themes from judge-discovered evaluator outputs, with evidence snippets or claim references for each cluster.
- Update `/lab` labels from `Failure Themes` to `Failure Clusters` only when the section is based on observed judge findings.

## Artifact Trail Reality Check

The `/lab` artifact trail should distinguish file-backed artifacts from evidence quality.

Current state:

- The artifact paths are real files that the run store checks before displaying.
- The generated baseline rows may come from `provider=local`, which proves the run pipeline but does not represent live model behavior.
- The reference target rows are committed fallback fixtures, not a newly generated candidate run.
- The deterministic evaluator outputs are useful for validating schemas, reports, and dashboard wiring, but they are not enough to claim model or prompt improvement.

Track the path to make this section fully real:

- Generate a live-provider baseline run, for example with `--provider=openai`, against the validated demo corpus.
- Generate a live-provider candidate run from the variant being demonstrated.
- Replace or augment the deterministic evaluator with a stronger evaluator path.
- Store provider/model/prompt metadata in the visible manifest details so the artifact trail explains how each file was produced.
- Keep seeded artifacts available only as fallback/demo fixtures, and label them that way whenever they appear.

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
