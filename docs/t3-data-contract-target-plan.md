# Data Contract Target Plan

Status: proposed

Parent plan: [t3-ux-replacement-plan.md](./t3-ux-replacement-plan.md)

## Target

Move the dashboard from TypeScript-only demo constants to Zod-validated filesystem fixtures and run artifacts.

## Fixture Shape

- `data/source-packets/*.json`: packet id, title, summary, source documents, citation ids, metadata.
- `data/eval-cases/*.json`: case id, title, request, packet references, expected coverage, traps, accepted citations, holdout flag, demo highlight flag.
- `runs/*/manifest.json`: run id, timestamp, variant label, git ref, aggregate metrics, artifact paths.
- `runs/*/traces/*.json`: generation input, prompt/messages, model metadata, structured briefing, tool calls, cost, latency, errors, provider trace summaries.
- `runs/*/evaluations/*.json`: evaluator scores, rubric evidence, failure tags, citation support, coverage notes.
- `runs/comparisons/*.json`: structured summaries generated from validated run artifacts.

## First Implementation Steps

1. Add `src/schemas/` with Zod contracts for source packets, eval cases, briefing outputs, generation traces, evaluator outputs, run manifests, and run comparisons.
2. Add `src/run-store/` filesystem helpers that load JSON, validate it with Zod, and return typed values via `z.infer`.
3. Seed the current TypeScript demo data into `data/` and `runs/` fixtures.
4. Add `mise exec -- bun run data:validate` to check all committed fixtures.
5. Expose read-only tRPC procedures for source packets, eval cases, artifacts, and run comparison summaries.

These steps create the data contract and starter fixtures only. The next phase should expand the synthetic eval set before live LLM generation/eval orchestration becomes the center of work: 8-12 cases, richer source packets, holdouts, seeded outputs, evaluator artifacts, and comparison data that can reveal real citation and synthesis failures.

## Guardrails

- Keep fixture data synthetic and public-safe.
- Report validation failures with file path and record id.
- Keep holdout cases visible as summaries but do not expose tuning labels in the UI.
- Do not add a database until the file-backed workflow becomes painful.
