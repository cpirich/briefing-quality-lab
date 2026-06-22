# Phase 6 Live Generation + Run Orchestration Plan

Status: started

Parent plans:

- [t3-ux-replacement-plan.md](./t3-ux-replacement-plan.md)
- [t4-data-contract-run-store-plan.md](./t4-data-contract-run-store-plan.md)
- [t5-expanded-eval-set-plan.md](./t5-expanded-eval-set-plan.md)

## Objective

Move from seeded-only artifacts to a runtime path where Briefing Genie can generate a briefing from a source packet through a shared TypeScript service, then let the lab start eval runs that persist generated briefings, traces, evaluator outputs, manifests, comparisons, and reports into the same Zod-validated run-store shape.

Phase 5 made the synthetic eval set large enough to expose useful failures. Phase 6 should make those failures actionable by generating new run artifacts from explicit variants instead of relying only on hand-authored baseline/candidate fixtures.

## Scope

This phase should start with a local deterministic generator and file-backed orchestration skeleton, then add the live LLM adapter once the runtime contract is stable. The deterministic generator is not the final product quality target; it is a fast contract test for the shared service, tRPC procedures, trace shape, and dashboard job flow.

## Non-Goals

- Do not remove the seeded Phase 5 artifacts. Keep them as fallback demo data and regression fixtures.
- Do not add a database, Redis queue, authentication, billing, or hosted deployment dependency.
- Do not expose eval-case tuning labels to the `/genie` product path.
- Do not claim real model improvement until baseline and candidate artifacts are generated through the live provider path.
- Do not rely on hidden chain-of-thought. Store only prompts, structured outputs, tool calls, provider-exposed summaries/traces, cost, latency, and errors.

## Phase 6A: Shared Generation Service

Add a shared `src/genie/` service callable from:

- `/genie` through `genie.generateBriefing`
- future lab actions through `genie.startBriefingJob`
- scripts and eval runners without React or route-local logic

The service should:

- accept a source packet and user request
- produce a `BriefingOutput`
- produce a `GenerationTrace`
- validate the output and trace with the same Zod schemas used by persisted artifacts
- support an explicit variant definition with id, label, provider, model, prompt version, and generation settings
- avoid reading `expectedCoverage`, `traps`, `acceptedCitations`, or evaluator notes from the product generation path

## Phase 6B: File-Backed Jobs

Add minimal job state for local demos:

- `genie.startBriefingJob`: start one briefing generation and return a job id
- `genie.getBriefingJob`: return queued/running/complete/failed state, generated output, trace path, error, elapsed time, and artifact paths
- write generated outputs and traces under `runs/<run-id>/briefings/` and `runs/<run-id>/traces/`
- use atomic-ish temp-file-then-rename writes for JSON artifacts where practical

This can start as an in-process local job registry because the app is local-only. If the runner later needs resumability across server restarts, promote job state into filesystem artifacts before considering a queue dependency.

## Phase 6C: Lab Eval Runner

Add lab-owned orchestration:

- `lab.startEvalRun`: run one explicit variant across selected visible eval cases by calling the shared generation service
- `lab.getEvalRun`: show progress, current case, elapsed time, artifact paths, and aggregate metrics
- write run manifests, generated briefings, generation traces, evaluator outputs, comparison artifacts, and a report
- support baseline and candidate run ids so the dashboard can compare generated artifacts, not just seeded fixtures
- keep holdout cases excluded from product selectors and tuning views, but allow lab-owned runs to include them for aggregate safety checks when explicitly requested

## Phase 6D: Live LLM Adapter

Add a provider adapter behind the shared service:

- keep provider selection in a small adapter layer rather than route code
- use structured output validated by Zod
- log model name, provider, generation settings exposed by the provider, token counts, estimated cost, latency, tool calls, tool results, provider-exposed trace summaries, and errors
- fail closed with a clear error when required API environment variables are missing
- preserve the deterministic local generator for offline demos and tests

The first live milestone should define an explicit generated baseline variant, run it across visible Phase 5 cases, and write a new `runs/baseline-*` directory. Candidate runs should compare against that generated baseline.

## Phase 6E: Dashboard Wiring

Update the UI after the backend path exists:

- make `/genie` call the real generation mutation/job instead of only refreshing seeded previews
- make `/lab` actions start and poll eval runs
- show progress, current case, artifact path being written, success/failure state, and latest comparison
- keep seeded comparisons visible when no generated comparison exists yet

## Acceptance Criteria

- `mise exec -- bun run data:validate` passes.
- `mise exec -- bun run check` passes.
- `mise exec -- bun run typecheck:native` passes before commit.
- Briefing generation is callable from both `/genie` and non-React TypeScript code.
- The `/genie` generation path does not read eval-only labels such as traps, expected coverage, accepted citations, or evaluator notes.
- Generated briefings and traces are Zod-validated before being returned or persisted.
- A generated baseline run can be written under `runs/baseline-*` without breaking seeded Phase 5 artifacts.
- The lab can show progress for eval runs and compare generated candidate artifacts against a generated baseline.
- Missing provider credentials produce a clear error and do not corrupt existing artifacts.
- Seeded Phase 5 fixtures remain available as deterministic fallback data.
