# Briefing Genie Improvement Lab

Briefing Genie Improvement Lab is a local AI-product eval demo. The product, **Briefing Genie**, generates concise strategy briefings from synthetic source packets. The lab evaluates those briefings, stores inspectable artifacts on disk, and shows whether a baseline or candidate run improved quality, citation grounding, cost, and latency.

The demo is designed around an improvement loop: inspect failures, form a bounded hypothesis, change the generator or prompt variant, run evals, compare against a baseline, and make a human shipping decision.

## Current App

- `/` redirects to `/lab`.
- `/lab` is the dense Improvement Lab dashboard for run history, score deltas, failure themes, artifacts, model metadata, case breakdowns, and before/after evidence.
- `/genie` is the lighter Briefing Genie product surface for generating one briefing from a visible source packet.
- tRPC exposes the local demo control surface for listing fixtures, generating briefings, starting eval runs, polling eval jobs, comparing runs, and listing artifacts.
- Fixture-backed runs are committed under `runs/` so the lab has useful data immediately after clone.

The repository is intended to be public. Keep source packets synthetic, do not commit secrets, and avoid private local filesystem paths or production data.

## Product Loop

```text
synthetic source packets
  -> Briefing Genie generator
  -> Zod-validated briefing artifact
  -> deterministic or hybrid evaluator
  -> filesystem-backed run store
  -> lab dashboard, reports, and before/after comparisons
```

Briefing Genie generation is shared by `/genie`, command-line eval flows, and lab-triggered eval jobs. Local deterministic generation works offline. OpenAI-backed generation and hybrid evaluation are optional and require `OPENAI_API_KEY`.

## Data And Artifacts

Committed fixtures live in:

```text
data/
  source-packets/   synthetic source packets
  eval-cases/       synthetic eval cases, including visible and holdout cases
  variant-specs/    focused generation variants for matrix runs
runs/
  baseline-*/       baseline manifests, briefings, traces, and evaluations
  candidate-*/      candidate/reference artifacts
  comparisons/      promoted comparison artifacts consumed by /lab
```

The fixture-backed run store is validated with Zod. Current validated counts are:

- 9 source packets
- 9 eval cases
- 3 run manifests
- 21 briefing outputs
- 14 generation traces
- 21 evaluator outputs
- 2 run comparisons
- 1 loop triage artifact
- 2 variant specs

Holdout cases remain available to local eval flows, but public lab endpoints redact holdout details and aggregate fields that would leak them.

## Local Setup

Use `mise exec --` for project commands in non-interactive terminals so the pinned Bun and Node versions from `mise.toml` are active.

```bash
mise exec -- bun install
mise exec -- bun run dev
```

The dev server runs on port 3000. Open either `http://localhost:3000/lab` or `http://127.0.0.1:3000/lab`; `next.config.js` allows the `127.0.0.1` dev origin for Next.js HMR.

Optional live provider settings can be copied from `.env.example` into `.env.local`:

```bash
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-5.2"
OPENAI_EVAL_MODEL="gpt-5.5"
```

Without `OPENAI_API_KEY`, use the default local provider paths.

## Common Commands

```bash
# Format/check the repo
mise exec -- bun run check
mise exec -- bun run check:write

# Fast TypeScript check
mise exec -- bun run typecheck:native

# Validate data, run fixtures, and artifact schemas
mise exec -- bun run data:validate

# Run evaluator smoke tests
mise exec -- bun run test:evaluator
```

Eval workflows:

```bash
# Print the current comparison/report view from stored artifacts
mise exec -- bun run eval:report

# Generate a local baseline over visible cases
mise exec -- bun run eval:baseline --provider=local

# Generate a local candidate against a baseline
mise exec -- bun run eval:variant --provider=local --baseline=<baseline-run-id>

# Include holdout cases when intentionally validating beyond the visible demo set
mise exec -- bun run eval:baseline --provider=local --include-holdouts

# Rejudge an existing run with the selected evaluator mode
mise exec -- bun run eval:rejudge --run-id=<run-id> --evaluator=deterministic
```

OpenAI-backed runs:

```bash
mise exec -- bun run eval:baseline --provider=openai --evaluator=hybrid
mise exec -- bun run eval:variant --provider=openai --evaluator=hybrid --baseline=<baseline-run-id>
```

Focused variant matrix and promotion:

```bash
# Dry-run the matrix plan first
mise exec -- bun run eval:matrix:dry-run

# Run a bounded matrix over selected variants/cases
mise exec -- bun run eval:matrix --provider=mixed --case-limit=3 --variant-limit=4

# Promote a completed candidate into a comparison artifact consumed by /lab
mise exec -- bun run eval:promote --baseline=<baseline-run-id> --candidate-run=<candidate-run-id> --label="<candidate label>"
```

## Architecture

```text
src/
  app/              Next.js App Router pages for /lab and /genie
  components/       local UI primitives
  genie/            briefing generation, variants, and OpenAI pricing helpers
  lab/              eval jobs and evaluator logic
  run-store/        filesystem readers, comparison assembly, and validation
  schemas/          Zod contracts for cases, briefings, traces, evals, and runs
  server/api/       tRPC routers
scripts/
  run-eval.ts       baseline, variant, report, and rejudge flows
  eval-matrix.ts    bounded variant matrix runner
  promote-eval-run.ts
  validate-data.ts
```

Zod is the contract layer between probabilistic AI output, persisted JSON artifacts, and typed product code. The app should stay TypeScript-only for the main demo path.

## Improvement Loop Skill

This repo includes a Codex skill at `.codex/skills/briefing-improvement-loop/`. Use it when operating the lab loop end to end: inspect eval failures, choose or author a bounded hypothesis, run the smallest useful validation, compare artifacts, update loop state, and recommend ship, iterate, reject, or needs-human-review.

## Demo Principles

- Keep Briefing Genie fast and bounded for single-briefing generation.
- Spend UI complexity in the lab views: run progress, score deltas, failures, citations, source evidence, and artifact links.
- Prefer dense operational surfaces over marketing pages.
- Treat generated baselines and candidate runs as inspectable artifacts, not hidden state.
- Keep human judgment visible: Codex can compress the loop, but the human decides whether the eval is valid and the change is worth shipping.
