# Phase 11 Lab Run Controls Plan

## Goal

Make the `/lab` run button a small, explicit run launcher instead of a single hard-coded OpenAI variant action. The launcher should let a demo operator start a full or filtered run, choose a generation model, and optionally adjust reviewed model settings without breaking the file-backed run/job path.

This is still local demo infrastructure. It should be typed and consistent, but it is not a replacement for a production worker queue, auth boundary, or durable job service.

## Current State

- `/lab` renders one `Run OpenAI variant` button.
- The client calls `lab.startEvalRun` with `{ provider: "openai" }`.
- The tRPC input accepts `provider`, `caseIds`, and `includeHoldouts`.
- `src/lab/eval-runs.ts` converts the request into an in-memory job and spawns `mise exec -- bun run eval:variant --provider=openai --evaluator=hybrid`.
- OpenAI child-process runs now forward `--case-id` and `--include-holdouts`.
- The CLI accepts `--case-id` and `--include-holdouts`, but generation model/settings are still controlled by repo defaults and environment variables rather than the lab UX.

## UX Shape

Keep the default path fast:

- Primary button: `Run OpenAI variant`
- Default scope: all visible non-holdout cases
- Default generation model/settings: repo defaults
- Default judge: hybrid evaluator with configured evaluator default

Add an optional compact run settings panel:

- Case scope:
  - `All visible cases`
  - `Selected cases`
  - Do not expose holdouts in the normal demo UI.
- Case selection:
  - multi-select visible eval cases by title/id
  - show selected count
  - warn that filtered runs are for smoke tests/retries, not the main improvement artifact
- Generation model:
  - select from a reviewed allowlist, not free-form arbitrary text
  - include the default model first
- Model settings:
  - temperature, max output tokens, reasoning effort, or other settings only after the generation path supports them
  - use restrained controls with safe defaults and bounds
- Advanced metadata:
  - optional run label or note for artifact inspection

## Plumbing Contract

Define one shared input shape and keep it aligned across layers:

```ts
interface LabRunOptions {
  provider: "openai";
  caseIds?: string[];
  includeHoldouts?: boolean;
  generationModel?: string;
  generationSettings?: {
    temperature?: number;
    maxOutputTokens?: number;
    reasoningEffort?: "minimal" | "low" | "medium" | "high";
  };
  runLabel?: string;
}
```

Use Zod at the tRPC boundary and reuse the inferred type in the job launcher when practical.

## Required Changes

1. Client controls
   - Replace the single hard-coded mutation call with a small form state object.
   - Keep the default click path equivalent to today's full visible OpenAI run.
   - Add a secondary settings disclosure so the demo operator can configure filtered/model runs without cluttering the first view.

2. API validation
   - Extend `lab.startEvalRun` input with `generationModel`, `generationSettings`, and optional `runLabel`.
   - Validate `caseIds` against visible cases unless `includeHoldouts` is explicitly allowed by an internal-only path.
   - Validate `generationModel` against the same reviewed model/pricing allowlist used by the CLI.

3. Job record
   - Store selected case ids, model, settings, run label, and effective command on the in-memory job.
   - Return those fields from `getEvalRun` so the status text can describe the run honestly.
   - Continue writing incomplete manifests for visible progress when a run is active.

4. Child process command
   - Forward model/settings from the job input to the CLI as explicit flags.
   - Keep command serialization deterministic so the manifest accurately records how the run was produced.
   - Avoid shell interpolation; pass each flag as a separate spawn arg.

5. CLI support
   - Add corresponding `eval:variant` options such as:
     - `--model=<model>`
     - `--temperature=<number>`
     - `--max-output-tokens=<number>`
     - `--reasoning-effort=<level>`
     - `--run-label=<label>`
   - Validate model pricing before live OpenAI calls.
   - Persist effective model/settings in traces and manifest metadata.

6. Reporting and lab display
   - Surface model/settings in evaluator/run metadata, not in the top metric cards.
   - Label filtered runs clearly, for example `OpenAI variant, 2/7 cases`.
   - Do not let a filtered run silently become the main demo comparison unless its case set matches the selected baseline/reference comparison.

## Guardrails

- The main demo artifact should remain a full visible-corpus run.
- Filtered runs are acceptable for smoke tests, targeted retries, and manual spot checks.
- Holdout-inclusive runs should remain private/internal until there is an authenticated holdout results surface.
- Model choices must be reviewed and priced before they appear in the UX.
- The local web server must still have `.env.local` sourced before starting a live OpenAI run.
- A hosted version would need an auth gate, worker queue, durable job records, cancellation, retries, and process recovery.

## Acceptance Criteria

- A default click still starts the same full visible OpenAI variant run as today.
- A filtered click starts a run whose selected cases are visible in the job status, manifest, and comparison.
- A selected generation model is passed from UI to tRPC to job to child process to trace/manifest.
- Invalid model/settings are rejected before spawning a child process.
- `/lab` status copy distinguishes full runs from filtered runs.
- No filtered run is presented as the primary improvement artifact without an explicit matching-case comparison.
