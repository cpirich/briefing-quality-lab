# Briefing Genie Improvement Lab

Briefing Genie Improvement Lab is a small AI product eval demo. The product, **Briefing Genie**, generates short research briefings from synthetic source packets. The lab evaluates those generated briefings for quality, writes inspectable run artifacts to the local filesystem, and shows run history plus before/after quality changes in a dashboard.

The repo currently starts from a stock T3 scaffold. That scaffold is only the starting point; the product UX should become an eval-lab dashboard, not a T3 landing page. See [docs/t3-ux-replacement-plan.md](docs/t3-ux-replacement-plan.md) for the rip-and-replace plan.

The demo theme is that Codex helps operate an AI-product improvement loop, not merely write a feature. Codex should inspect behavior, understand eval failures, propose a product hypothesis, edit code or prompts, run evals, compare the result, and stop with a recommendation for the human.

## Product Loop

The intended loop is:

```text
synthetic source packets
  -> briefing generator
  -> Zod-validated briefing artifact
  -> evaluator output and metrics
  -> filesystem-backed run store
  -> dashboard, reports, and before/after comparisons
```

The demo should make Codex operate the eval loop: inspect failed runs, propose hypotheses, change code or prompts, run evals, compare against baseline, and stop with a product recommendation.

## Product And Lab Split

The app has two related jobs:

- Briefing Genie: generate a short briefing from a selected source packet. This path should be quick, bounded, and easy to understand.
- Briefing Genie Improvement Lab: make quality visible. This path should show run progress, score deltas, failure clusters, citation evidence, sample outputs, and before/after comparisons clearly enough to observe during a demo.

Briefing Genie should not become a complex authoring surface. The demo value is in the lab showing whether the AI-powered product improved.

Both surfaces should execute from this repo and share the same schemas, run store, and dataset. They should still be visibly separate in the browser:

- `/genie`: Briefing Genie, a lighter product surface for quickly generating one briefing.
- `/lab`: Briefing Genie Improvement Lab, a denser visual eval surface for inspecting runs, failures, scores, and before/after evidence.

Use distinct page titles and enough visual difference in color, density, and layout that a viewer can tell which surface is on screen at a glance.

The repository is intended to be public. Avoid committing private local filesystem paths, private planning-note locations, secrets, or production data. There is no hosted preview plan yet, so full-stack operation is local-only for the time being.

## Dataset Strategy

The dataset is the demo's truth source. It should be small, synthetic, visually legible, and structured enough for Codex to inspect.

Initial target:

- 8-12 eval cases total
- 3-4 highlighted cases for the live demo
- 1 featured failure cluster: plausible briefings with weak or missing citation support
- 1-2 hidden or holdout cases to discourage tuning only to visible examples

Each eval case should include:

- user request
- source packet with 5-10 synthetic source documents
- expected coverage points
- known traps or ambiguities
- acceptable citations
- baseline model output
- rubric scores
- evaluator notes
- failure tags

The preferred initial domain is a synthetic developer-tooling / AI-product strategy dataset. It is close enough to the Codex session to feel relevant, but abstracted enough to avoid production data, privacy, or benchmark claims.

Dataset artifacts should be committed under `data/`, discovered from the filesystem, and validated with Zod before use. A seed command should create deterministic baseline/candidate run artifacts and sample traces so the lab can show useful states without live model calls. Once live LLM generation is available, those seeded baselines should be replaced by stored LLM-generated baseline runs and kept only as fallback demo data.

## Current Stack

- Next.js App Router
- React
- tRPC
- Zod
- Tailwind CSS
- Bun, pinned through `mise.toml`

Near-term UI work should use shadcn/ui components as the default component foundation.

The app should stay TypeScript-only for demo reliability. Zod is the important contract layer: it keeps LLM communication, eval cases, evaluator outputs, filesystem artifacts, and dashboard data type-safe without adding another service boundary.

The lab should use shadcn theming and chart components where they help the demo read quickly. Area charts are a good first candidate for score, cost, and latency trends.

## LLM And Trace Requirements

Briefing Genie should support at least one current LLM API with structured output and tool calls. Use Zod for tool-call arguments, tool-call results, structured model output, evaluator output, and persisted run artifacts. Convert Zod schemas to JSON Schema when the provider requires it, and use `z.infer` for TypeScript types.

Briefing Genie should log rich generation traces to the backend filesystem: inputs, selected sources, prompts/messages, structured outputs, tool calls, tool results, errors, model metadata, cost, latency, and provider-exposed trace or reasoning summaries when available. Do not rely on hidden chain-of-thought.

Evals run from the lab side. The same Briefing Genie generation code must be callable from the `/genie` UX and programmatically from lab/eval flows so the lab can run hands-free across many cases.

Known tRPC entry points should control jobs and lab runs: list source packets, generate or start a briefing job, poll briefing job status, list eval cases, start eval runs, poll eval run status, compare runs, and list artifacts.

The first live-generation milestone should define an explicit baseline variant, run it across the eval corpus, and persist generated baseline briefings, traces, evaluator outputs, and manifests under `runs/baseline-*`. Candidate runs should then compare against those generated baseline artifacts instead of the hand-authored seeded baseline.

## Planned Repo Shape

```text
src/
  app/              Next.js routes for Briefing Genie and the lab
  server/           tRPC API surface
  eval/             eval runner, scoring, and comparison logic
  genie/            generation service and LLM/tool-call adapters
  schemas/          Zod contracts for cases, briefings, evals, and runs
  run-store/        filesystem read/write helpers for run artifacts
data/
  source-packets/   synthetic source packets
  eval-cases/       synthetic eval cases
  rubrics/          briefing quality rubrics
runs/
  baseline/         committed or generated baseline artifacts
  variant-*/        experiment artifacts
reports/
  latest-eval-summary.md
  failure-clusters.md
```

## Local Commands

Use `mise exec --` for project commands in non-interactive terminals so the pinned Bun and Node versions are active.

```bash
mise exec -- bun run dev
mise exec -- bun run check
mise exec -- bun run typecheck:native
```

Expected future demo commands:

```bash
mise exec -- bun run demo:seed
mise exec -- bun run data:validate
mise exec -- bun run eval:baseline
mise exec -- bun run eval:latest
mise exec -- bun run eval:compare
```

## Success Criteria

- The first screen shows the eval lab, not stock framework boilerplate.
- The UI clearly separates Briefing Genie, the fast product surface, from Briefing Genie Improvement Lab, the visual eval surface.
- `/genie` and `/lab` have distinct titles and visual treatments while sharing the same underlying TypeScript/Zod codebase.
- Generating an individual briefing is fast enough to use live without losing the room.
- Baseline quality, failure clusters, sample outputs, and run artifacts are visible.
- Generation traces are file-backed and rich enough for the lab to inspect what happened.
- Evals are run from the lab side and can trigger Briefing Genie programmatically.
- Synthetic datasets are committed fixtures discovered from `data/`, validated with Zod, and seedable into baseline lab artifacts.
- Seeded baseline artifacts are replaced by LLM-generated baseline run artifacts once generation is wired up.
- Before/after comparisons include quality, cost, latency, and holdout-safety context.
- Zod schemas define the boundary between probabilistic AI output, persisted artifacts, and typed product code.
- The demo keeps human judgment visible: Codex can compress the loop, but the human decides whether the eval is valid and the product change is worth shipping.
- The app remains small enough to run locally and inspect during a live Codex demo.
