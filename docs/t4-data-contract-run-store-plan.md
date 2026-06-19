# Phase 4 Data Contract + Run Store Plan

Status: implementation target

Parent plans:

- [t3-ux-replacement-plan.md](./t3-ux-replacement-plan.md)
- [t3-data-contract-target-plan.md](./t3-data-contract-target-plan.md)

## Objective

Move Briefing Genie and the Briefing Genie Improvement Lab from UI-local TypeScript constants to committed, synthetic, Zod-validated fixtures and read-only tRPC procedures.

This phase does not add live LLM calls. It makes the demo evidence inspectable by future Codex sessions through `data/`, `runs/`, and `reports/`.

This phase intentionally seeds only a tiny starter dataset. Those source packets are for validating the run-store shape, route wiring, and citation display. The next planned slice is [Phase 5: Expanded Synthetic Eval Set](./t5-expanded-eval-set-plan.md), which should add larger packets and enough cases for meaningful eval and improvement work before live generation becomes the main focus.

## Fixture Paths

- `data/source-packets/*.json`: source packets selectable by Briefing Genie.
- `data/eval-cases/*.json`: eval cases owned by the lab.
- `runs/baseline-2026-06-10/manifest.json`: seeded baseline run summary.
- `runs/candidate-citation-gates/manifest.json`: seeded candidate run summary.
- `runs/candidate-citation-gates/briefings/*.json`: seeded structured Briefing Genie outputs.
- `runs/candidate-citation-gates/traces/*.json`: seeded generation traces.
- `runs/candidate-citation-gates/evaluations/*.json`: seeded evaluator outputs.
- `runs/comparisons/baseline-2026-06-10__candidate-citation-gates.json`: seeded run comparison backing the dashboard.
- `reports/latest-eval-summary.md`: human-readable synthetic summary linked from artifacts.

Note: Source packet fixtures use `sources[].body` for the synthetic source text available to Briefing Genie. That field should be understood as packet evidence, not as evidence selected by a separate hidden excerpting pipeline. Later phases may add preview-specific UI fields if the document bodies become too long for direct display.

## Schema Fields

`SourcePacket`

- `id`
- `title`
- `summary`
- `caseId`
- `sources[]` with `id`, `title`, `body`, and optional `documentType`
- `metadata` with `theme`, `synthetic`, `publicSafe`, and optional `createdBy`

`EvalCase`

- `id`
- `title`
- `sourcePacketId`
- `task`
- `expectedCoverage[]`
- `traps[]`
- `acceptedCitations[]`
- `holdout`
- `demoHighlight`
- `failureTags[]`
- `metadata` with `synthetic`, `publicSafe`, and optional `notes`

`BriefingOutput`

- `id`
- `sourcePacketId`
- `caseId`
- `title`
- `summary`
- `claims[]` with `text` and `citations[]`
- `openQuestions[]`
- `recommendation`
- `metadata` with `variant`, `runId`, optional `model`

`GenerationTrace`

- `id`
- `runId`
- `caseId`
- `sourcePacketId`
- `input`
- `messages[]`
- `model`
- `output`
- `toolCalls[]`
- `cost`
- `latencyMs`
- `artifactPaths`
- optional `error`

`EvaluatorOutput`

- `id`
- `runId`
- `caseId`
- `scores`
- `failureTags[]`
- `rubricEvidence[]`
- `citationSupport[]`
- `notes`
- `artifactPaths`

`RunManifest`

- `runId`
- `createdAt`
- `variantLabel`
- `status`
- `gitRef`
- `command`
- `caseIds[]`
- `aggregateMetrics`
- `guardrails[]`
- `artifactPaths`

`RunComparison`

- `id`
- `baselineRunId`
- `candidateRunId`
- `metrics[]`
- `trend[]`
- `comparisonRows[]`
- `failureClusters[]`
- `featuredCase`
- `recommendation`
- `artifactPaths`

## Read Store

Add `src/run-store/` with filesystem readers that:

- read JSON from repo-relative fixture paths
- validate every JSON file with Zod before returning data
- return `z.infer` TypeScript types from the same schemas
- sort records by id or timestamp for deterministic UI output
- throw errors that include the fixture path and record id when validation fails

## tRPC Procedures

Add read-only procedures:

- `genie.listSourcePackets`
- `genie.listSeededBriefingOutputs`
- `lab.listEvalCases`
- `lab.listArtifacts`
- `lab.compareRuns`

Future live-generation procedures stay out of scope for this phase.

## Commands

Add:

```bash
mise exec -- bun run data:validate
```

The command loads every committed fixture through the run-store readers and prints counts for source packets, eval cases, run manifests, briefing outputs, evaluator outputs, traces, comparisons, and artifacts.

## Acceptance Criteria

- `mise exec -- bun run data:validate` passes.
- `mise exec -- bun run check` passes.
- `mise exec -- bun run typecheck:native` passes.
- `/genie` and `/lab` preserve the current visual state while reading from the fixture-backed model.
- The app no longer imports `src/lib/demo-lab-data.ts` as the source of truth.
- Validation errors include a useful fixture path and, when available, a record id.
- All committed data is synthetic and public-safe.
- A future Codex session can inspect `data/`, `runs/`, and `reports/` to explain the baseline failure cluster.
- The follow-on plan identifies the Phase 4 packets as smoke fixtures, not a complete eval set.
