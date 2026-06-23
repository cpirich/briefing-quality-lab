# Phase 9 OpenAI Provider Runbook

Status: planned

Parent plans:

- [t6-live-generation-orchestration-plan.md](./t6-live-generation-orchestration-plan.md)
- [t8-generated-baseline-runs-plan.md](./t8-generated-baseline-runs-plan.md)

## Objective

Move from local generated-run rehearsal to live OpenAI provider artifacts while keeping the evidence boundary clear.

The first OpenAI pass is a provider shakedown, not a final improvement claim. It should prove that the shared Briefing Genie generation path can call the live provider, persist schema-valid artifacts, and give the lab inspectable runs. Treat model-quality claims as provisional until both baseline and candidate runs use the live provider and the evaluator path is strong enough for the claim.

## Prerequisites

- Phase 8 generated-run work is merged or otherwise stable on the working branch.
- `.env.local` contains `OPENAI_API_KEY`.
- Optional: `.env.local` contains `OPENAI_MODEL` when testing a model other than the app default.
- The visible non-holdout eval corpus validates.
- The local generated-run path remains available as a cheap offline rehearsal and regression path.

## Environment Setup

Source `.env.local` into the same shell that runs the eval commands:

```bash
set -a
source .env.local
set +a
```

Do not commit `.env.local`, provider keys, private traces, or local-only planning paths.

## Preflight Checks

Run the project gates before spending live-provider calls:

```bash
mise exec -- bun run data:validate
mise exec -- bun run check:write
mise exec -- bun run typecheck:native
```

If any gate fails, fix that before calling the OpenAI provider.

## First Live Baseline

Generate the first OpenAI baseline against the default visible non-holdout case set:

```bash
mise exec -- bun run eval:baseline --provider=openai
```

Expected result:

- a new `runs/baseline-openai-*` directory
- one briefing artifact per visible eval case
- one generation trace per visible eval case
- one evaluator output per visible eval case
- a complete `manifest.json` with OpenAI provider/model metadata

After the run:

```bash
mise exec -- bun run data:validate
```

## Artifact Review

Before committing generated OpenAI artifacts, inspect the run manually:

- Briefings cite only source ids from their source packet.
- Claims do not introduce facts outside the synthetic packet.
- Recommendations match the user request and do not overstate certainty.
- Traces include prompt/input metadata, model/provider metadata, token usage when available, latency, and artifact paths.
- The run manifest has the expected visible case set and complete artifact paths.
- Cost and latency are acceptable for a demo run.

The deterministic evaluator may help find obvious regressions, but it is not enough by itself to prove model improvement.

## First Live Candidate

After the OpenAI baseline looks useful, generate a candidate run with the same visible case set:

```bash
mise exec -- bun run eval:variant --provider=openai
```

The candidate command should compare against the latest complete OpenAI baseline unless an explicit baseline is supplied:

```bash
mise exec -- bun run eval:variant --provider=openai --baseline=<baseline-run-id>
```

## Report Generation

Generate or refresh the comparison report from existing run artifacts:

```bash
mise exec -- bun run eval:report --provider=openai
```

Use explicit run ids when reviewing a specific before/after pair:

```bash
mise exec -- bun run eval:report --baseline=<baseline-run-id> --candidate=<candidate-run-id>
```

## Evidence Boundary

Use these labels consistently:

- Local baseline or local candidate: pipeline rehearsal.
- OpenAI baseline versus reference target: live-provider gap check.
- OpenAI baseline versus OpenAI candidate: live-provider before/after comparison.
- Any comparison scored only by the deterministic evaluator: provisional quality evidence.

Do not claim real prompt, model, or product improvement until:

- both sides of the comparison are generated through the OpenAI provider path
- generated artifacts pass manual review
- holdouts remain separate from tuning runs
- the evaluator is strong enough for the claim being made, or the claim is explicitly framed as a heuristic/demo signal

## Commit Guidance

Commit OpenAI artifacts only after inspection shows they are useful demo evidence. If the first live run mainly proves connectivity, keep it local or replace it with a clearer run before committing.

When committing generated artifacts, include the run id in the commit message and mention whether the comparison is a baseline, candidate, or report refresh.

## Next Improvements

- Add a stronger evaluator or judge path with observed strengths, weaknesses, citation problems, missing evidence, unsupported claims, and failure tags.
- Surface provider/model/prompt metadata more prominently in `/lab`.
- Add a small OpenAI smoke command that runs one visible case before a full corpus pass.
- Keep seeded and local artifacts available as fallback fixtures, but label them as rehearsal data wherever they appear.
