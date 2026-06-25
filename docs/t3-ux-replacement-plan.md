# Stock T3 UX Rip-and-Replace Plan

Status: draft

Source context: internal demo-planning notes about Codex orchestration, the Briefing Genie demo candidate, synthetic eval dataset strategy, and AI-product experiment loops.

## Objective

Replace the stock Create T3 App first screen with a real Briefing Genie Improvement Lab dashboard: an operational surface for inspecting baseline eval quality, failed briefing cases, run artifacts, and before/after experiment results from Briefing Genie.

The first viewport should feel like a working product, not a landing page. It should answer: what ran, how good was it, what failed, what changed, and whether the change is worth shipping.

The product action should stay simple and quick: select a source packet, generate a concise Briefing Genie output, and persist it. Briefing Genie Improvement Lab should carry more of the visual weight by showing what happened across runs and why the quality changed.

## Nomenclature

- Briefing Genie: the AI product being improved. It generates a concise briefing from a selected source packet.
- Briefing Genie Improvement Lab: the eval and experiment dashboard. It shows runs, quality scores, failure clusters, citation support, artifacts, and before/after evidence.
- Briefing Quality Lab: the repo/project shorthand. Avoid using it as the primary in-app brand when the product/lab distinction matters.

## Route Split

Both surfaces should live in the same Next.js app and repo, but they should be distinct routes:

- `/genie`: Briefing Genie. Fast, focused product surface for selecting a source packet and generating one briefing.
- `/lab`: Briefing Genie Improvement Lab. Dense eval surface for run history, progress, metric deltas, failure clusters, artifacts, and before/after comparison.
- `/`: redirect to `/lab` or render the lab overview once the stock T3 page is removed.

Use route-specific metadata so browser tabs and screenshots are unambiguous:

- `/genie` title: `Briefing Genie`
- `/lab` title: `Briefing Genie Improvement Lab`

They should share the same TypeScript/Zod schemas, fixtures, run store, and tRPC/API layer. The distinction is product clarity, not separate deployments.

## Non-Goals

- Do not add authentication, a database, billing, or production integrations for the first pass.
- Do not build a marketing homepage.
- Do not make external observability tools required for the demo.
- Do not add a hosted preview dependency yet. This will be a public GitHub repo, but full-stack operation is local-only until a hosting plan exists.
- Do not depend on live model calls for every visual state; committed or seeded fixtures should support a reliable local demo.
- Do not add Python, Go, Rust, or another service boundary for the main demo path.

## Design System Direction

- Use shadcn/ui as the preferred component foundation for dashboard primitives.
- Start with components that match the product shape: `button`, `badge`, `tabs`, `table`, `card`, `separator`, `scroll-area`, `sheet`, `dialog`, `tooltip`, `select`, and chart/table helpers as needed.
- Use shadcn charts for the lab where they make trends legible quickly. The shadcn chart examples are Recharts-backed, copyable components; area charts are a good first candidate for run-score trend and cost/latency history.
- Use shadcn theming with semantic CSS variables/tokens. Distinguish `/genie` and `/lab` with route-level theme classes or scoped tokens rather than one-off color utilities.
- Use the shadcn MCP server only when it saves time discovering registry components or blocks. The CLI and local edits are enough for straightforward primitives.
- Keep the interface dense, scannable, and operational. This is an eval workbench, not a SaaS marketing page.
- Give `/genie` and `/lab` visibly different layouts and color accents. Briefing Genie should feel lighter and focused; the lab should feel more analytical, with denser tables, metrics, badges, charts, and artifact links.

## Stock T3 Pieces To Replace

- Replace `src/app/page.tsx` with a dashboard shell.
- Update `src/app/layout.tsx` metadata from Create T3 App to Briefing Genie Improvement Lab.
- Add `src/app/genie/page.tsx` for the product surface and `src/app/lab/page.tsx` for the lab surface.
- Remove the purple gradient hero, T3 documentation links, and demo `LatestPost` surface from the primary route.
- Retire the sample `post` router and `_components/post.tsx` once real run-store endpoints exist.
- Keep the useful scaffold: App Router, tRPC wiring, Zod, Tailwind, and Bun/mise project commands.

## Target Information Architecture

The app should have two top-level surfaces. Briefing Genie has one primary view:

- Briefing Genie: fast briefing generation for a selected source packet, with generated output and citations visible immediately.

Briefing Genie Improvement Lab should have five primary views:

- Overview: active baseline, latest variant, score deltas, cost/latency guardrails, and recommended next action.
- Runs: run history table with status, commit/variant label, score summary, cost, latency, artifact path, and comparison target.
- Failures: ranked failure clusters with affected cases, evaluator notes, and links into source packets and generated briefings.
- Case Explorer: one eval case at a time, showing source material, generated briefing, citations, evaluator output, and before/after diff.
- Artifacts: filesystem-backed run manifest, model outputs, evaluator outputs, reports, and trace files.

## Dataset Direction

Use a small synthetic developer-tooling / AI-product strategy dataset. Briefing Genie should feel like a fictional but plausible product, so the cases are realistic without exposing private data or making benchmark claims.

The initial three source packets added with the run-store slice are starter fixtures for UI, schema, and citation smoke testing. They are intentionally too small for meaningful LLM evaluation. Before live generation or eval orchestration becomes the main work, expand them into a first real synthetic eval set with larger, messier source packets.

Each case should include:

- user request
- source packet with 3-6 source documents that are long enough to create non-trivial grounding and citation choices
- expected coverage points
- known traps or ambiguities
- acceptable citations
- baseline model output
- rubric scores
- evaluator notes
- failure tags

Initial dataset size:

- 8-12 total eval cases
- 3-4 highlighted cases for live demo walkthroughs
- 1 featured failure cluster around weak citation grounding
- 1-2 hidden or holdout cases for basic anti-gaming signal

Demo-realistic dataset size:

- 25-40 total eval cases once the first expanded set is reviewed
- 4-6 highlighted cases for the live walkthrough
- 5-8 holdout or regression cases that contribute to aggregate confidence but do not expose tuning labels
- enough examples to show repeated failure patterns across citation grounding, stale evidence, unsupported recommendations, cost/latency tradeoffs, human approval boundaries, and holdout leakage

Use 8-12 cases to prove the richer fixture shape and keep the first Phase 5 PR reviewable. Move to 25-40 cases only through the staged authoring and review loop in [t7-demo-realistic-eval-expansion-plan.md](./t7-demo-realistic-eval-expansion-plan.md) before claiming real prompt, model, or evaluator improvement. Treat 60-100 cases as a later hardening target once live generation, evaluator reliability, and run costs are stable.

Good case themes:

- code review bottlenecks
- cloud versus local execution
- eval-driven product development
- environment setup reliability
- developer adoption
- cost and latency tradeoffs
- human judgment and governance

Good packet traits:

- enough source text that the answer cannot simply restate every snippet
- mixed relevance, including distractor details that should not be cited
- overlapping evidence across sources so citation choice matters
- at least occasional tension between sources, stale evidence, missing data, or ambiguity
- expected outputs and evaluator notes that identify unsupported claims, weak citations, and overconfident recommendations

## Dataset Lifecycle

The synthetic dataset should be explicit repo data, not hidden app state.

- Create: author the first dataset as committed JSON or JSONL fixtures under `data/eval-cases/` and `data/source-packets/`. A script may generate draft cases, but the committed fixtures should be reviewed and deterministic.
- Validate: load every dataset file through Zod schemas before the app or lab uses it. Validation failures should point to the file and case id.
- Discover: Briefing Genie and the lab should discover available source packets and eval cases from the filesystem-backed dataset index, exposed through tRPC read procedures.
- Seed: provide a command that writes baseline run artifacts and sample generation traces from the dataset, so the lab has useful visual states without live model calls.
- Holdout: mark 1-2 cases as holdout in the fixture metadata and keep them visible as holdout summaries, not as tuning examples.
- Iterate: if Codex proposes new or changed eval cases, write them as fixture changes and validate them before they appear in lab runs.

## Lab First View Layout

The `/lab` route should show:

- Top bar labeled Briefing Genie Improvement Lab, selected run pair, and actions for seed, run evals, compare, and open latest report.
- Compact Briefing Genie panel for selecting a source packet and producing one briefing without leaving the dashboard.
- Metric strip for overall quality, citation grounding, coverage, cost ratio, and latency ratio.
- Run comparison table with baseline versus latest variant.
- Failure cluster list with short evaluator evidence.
- Featured case diff showing source evidence from the packet, baseline briefing, variant briefing, and evaluator notes. The UI may show previews or excerpts for readability, but the product scenario is that Briefing Genie evaluates source documents in the packet, not pre-selected excerpts from an unstated upstream process.
- Artifact links that make it obvious where the evidence lives on disk.

## Genie First View Layout

The `/genie` route should show:

- Page title and metadata that say Briefing Genie.
- Source packet selector with short source summaries.
- Single generate action.
- Briefing result panel that starts empty for the selected packet, then shows the generated briefing with claims, citations, open questions, and recommendation after generation completes.
- Lightweight links back to the corresponding lab case or latest evaluation, without turning the product page into the lab.

The product route should not prefill the main result panel with seeded baseline or candidate artifacts. Seeded outputs are useful for the lab, offline fixtures, visual regression, and deterministic fallback states, but showing them as the default `/genie` result blurs the difference between an example artifact and a briefing the user just generated.

## Demo Pacing Requirements

- Single-briefing generation should complete quickly enough for live use. If live generation is unavailable, the product route should show a clear not-generated or error state rather than silently replacing the result with a seeded candidate artifact.
- Eval runs can take longer, but the lab should show observable progress: queued/running/complete state, current case, elapsed time, and the artifact path being written.
- The most visual states should be in the lab: score cards, delta indicators, failure tags, citation coverage, and before/after diff panels.
- Avoid building a full document editor. The product exists to generate outputs that the lab can evaluate.

## Data And Contract Plan

Add Zod schemas before the UI becomes deeply dynamic:

- `EvalCase`: id, title, source packet references, task instructions, rubric tags, holdout flag.
- `SourcePacket`: id, source notes, citation ids, metadata.
- `BriefingOutput`: title, summary, claims, citations, open questions, model/cost/latency metadata.
- `ToolCallTrace`: tool name, Zod-validated arguments, Zod-validated result, status, timestamps, and error details.
- `GenerationTrace`: request input, selected source packet, model/provider metadata, prompt/messages, structured output, tool calls, available provider trace or reasoning summary, cost, latency, and artifact paths.
- `EvaluatorOutput`: overall score, grounding score, coverage score, citation support score, failure notes, rubric evidence.
- `RunManifest`: run id, timestamp, variant label, command, git ref, aggregate metrics, artifact paths.
- `RunComparison`: baseline run, candidate run, deltas, pass/fail guardrails, recommendation.

The important boundary is:

```text
probabilistic AI output -> Zod-validated artifact -> z.infer types -> tRPC/read model -> dashboard
```

## tRPC Control Surface

Use known tRPC entry points so the UI, lab, and scripts do not each invent their own control path.

Suggested routers and procedures:

- `genie.listSourcePackets`: discover source packets available to Briefing Genie.
- `genie.generateBriefing`: synchronously generate one briefing for the `/genie` UX when live generation is fast enough.
- `genie.startBriefingJob`: enqueue or start a briefing generation job and return a job id. This is the preferred entry point for lab-triggered runs.
- `genie.getBriefingJob`: read job status, progress, output artifact path, and trace artifact path.
- `lab.listEvalCases`: discover eval cases, including highlighted and holdout metadata.
- `lab.startEvalRun`: start a lab-owned eval run over selected cases and variants.
- `lab.getEvalRun`: read run status, progress, aggregate metrics, and artifact paths.
- `lab.compareRuns`: compare baseline and candidate run artifacts.
- `lab.listArtifacts`: expose run manifests, generation traces, evaluator outputs, reports, and source packet links.

Back these procedures with shared TypeScript services rather than route-local logic. The generation service should be callable from tRPC, scripts, and eval runners.

## Runtime And LLM Requirements

- The repo will be public, but there is no hosted preview plan yet. Assume full-stack operation is local-only for now.
- Support at least one current LLM API that can handle structured output and tool calls. Keep provider details behind a small TypeScript adapter so the rest of the app talks in Zod schemas and inferred types.
- Use Zod for tool-call arguments, tool-call results, structured model output, eval cases, evaluator output, and persisted artifacts. Convert Zod schemas to JSON Schema where the LLM API requires schema payloads, and use `z.infer` for TypeScript types.
- Briefing Genie should log everything needed for the lab to understand what happened: inputs, selected sources, prompts/messages, structured outputs, tool calls, tool results, errors, model metadata, token/cost/latency data, and provider-exposed traces or reasoning summaries when available.
- Do not depend on hidden chain-of-thought. Log only provider-returned trace fields, summaries, and tool-call data that the API exposes.
- Store generation traces and eval artifacts on the backend filesystem. Keep this file-backed until a database is clearly needed.
- Evals run from the lab side. The lab should be able to trigger many Briefing Genie generations programmatically, collect traces, run evaluator logic, and write run artifacts without manual product-page clicks.
- The Briefing Genie generation code must be callable from both the `/genie` UX and programmatic lab/eval flows. Prefer a shared service function under `src/` that both tRPC procedures and eval commands can call.
- A queue may be useful if eval runs become long or concurrent. Start with the simplest local queue or sequential runner that gives visible progress. BullMQ plus Redis is an option later, but likely overkill for the first demo unless local concurrency/state management becomes painful.

## TypeScript And Zod Strategy

Keep the implementation TypeScript-only:

- TypeScript/React for the dashboard.
- TypeScript/tRPC for the API.
- TypeScript eval orchestration, scoring, comparison, and report generation.
- Zod for LLM outputs, JSON Schema conversion, tool-call shapes, eval cases, evaluator outputs, traces, and persisted run artifacts.

The meaningful boundary is between probabilistic LLM communication and deterministic product code. Zod should validate that boundary at runtime, while `z.infer` gives the rest of the TypeScript app static types from the same schemas.

## Implementation Phases

1. Documentation and direction
   - Update README with product intent, planned architecture, and local commands.
   - Update AGENTS with shadcn/ui preference and dashboard UX guidance.
   - Add this UX replacement plan.

2. shadcn setup
   - Initialize shadcn for the current Next.js/Tailwind setup.
   - Add only the primitives needed for the first dashboard pass.
   - Add shadcn chart support for at least one lab trend visualization, likely an area chart for run score over time.
   - Add route-level theme tokens/classes so `/genie` and `/lab` are visually distinct while sharing the same component system.
   - Commit generated component code so future agents can inspect and adapt it locally.

3. Static dashboard pass
   - Replace the stock T3 homepage with fixture-backed lab content.
   - Add a separate `/genie` product route with its own title and lighter visual treatment.
   - Use realistic baseline and variant numbers from the demo notes.
   - Feature the citation-grounding failure cluster and make the before/after difference visible without reading every artifact.
   - Include a compact single-briefing generation surface so the product behavior is visible without becoming the whole app.
   - Confirm the first screen reads well on laptop and conference-room sizes.

4. Schemas and run-store read model
   - Add Zod schemas for eval cases, briefing outputs, tool-call traces, generation traces, evaluator outputs, run manifests, and comparisons.
   - Add filesystem helpers for discovering and validating `data/` and `runs/`.
   - Expose run summaries and selected case details through tRPC.

5. Expanded synthetic eval set
   - Treat the Phase 4 run-store fixtures as smoke fixtures, not the final eval set.
   - Add reviewed fixture files for 8-12 synthetic eval cases with 3-4 highlighted cases and 1-2 holdout cases.
   - Expand source packets beyond the current three-snippet shape so they contain 5-10 richer source documents with distractors, overlaps, ambiguity, and citation traps.
   - Add or refresh seeded baseline/candidate briefing outputs, evaluator outputs, traces, and comparisons so the lab shows meaningful before/after evidence without live model calls.
   - Treat seeded baseline/candidate outputs as deterministic stand-ins for stored run artifacts, not as the final evidence for product improvement claims.
   - Keep holdout summaries visible, but keep tuning labels and expected answers out of the Genie product surface.
   - Validate the expanded dataset with Zod before wiring it into any live generation or eval-run path.

6. Demo-realistic eval expansion
   - Grow the reviewed Phase 5 fixture set from 8-12 cases to 25-40 cases only after selecting [the Phase 7 expansion plan](./t7-demo-realistic-eval-expansion-plan.md) as the active slice.
   - Add cases in small reviewed batches rather than bulk-generating placeholder packets.
   - Keep 4-6 cases highlighted for live walkthroughs while metrics and failure clusters come from the broader set.
   - Add enough cases to get repeated examples per target failure mode, especially citation grounding, stale evidence, unsupported recommendations, cost/latency tradeoffs, human approval boundaries, and holdout leakage.
   - Preserve the holdout boundary by keeping holdout labels and expected answers out of `/genie` and prompt-iteration views.
   - Use this dataset size as the minimum bar for credible "real improvement work" during demo preparation.

7. Generation runtime and trace logging
   - Add a shared Briefing Genie generation service callable from both `/genie` and lab/eval code.
   - Add tRPC entry points for synchronous generation, job start, and job status.
   - Integrate at least one current LLM API with structured output and tool-call support.
   - Log generation traces to the backend filesystem so the lab can inspect inputs, outputs, tools, model metadata, costs, latency, and available provider traces.
   - Define a baseline variant with explicit model, prompt, generation settings, and artifact metadata.
   - Run the baseline variant through the same source packets and eval cases, then replace the seeded baseline briefing outputs with stored LLM-generated baseline run artifacts.
   - Keep the seeded baselines available only as deterministic fallback/demo fixtures after real baseline runs exist.

8. Dataset commands and artifact path
   - Add dataset indexes and any seed metadata needed for deterministic discovery.
   - Add seed data, sample generation traces, and baseline artifacts.
   - Add commands for seed, baseline generation/eval, latest generation/eval, and compare.
   - Ensure `eval:baseline` writes a new `runs/baseline-*` directory with generated briefings, traces, evaluator outputs, manifest metadata, and comparison-ready artifact paths.
   - Make dashboard states work with both fixture data and generated run artifacts.

9. Lab eval runner and experiment-loop affordances
   - Add a plan/report artifact that Codex can update after runs.
   - Ensure evals run from the lab side and can trigger Briefing Genie generations programmatically.
   - Add tRPC entry points for eval-run start, eval-run status, run comparison, and artifact listing.
   - Show stop conditions: improve citation grounding without more than 10% cost or latency regression.
   - Show lab progress states while evals run so the demo has visible motion even when the backend is doing work.
   - Use a simple local run queue/sequential runner first; revisit BullMQ and Redis only if concurrency or persistence needs justify it.
   - Include a recommendation state so the loop ends with human review, not endless iteration.

10. End-to-end demo polish
   - Run the dashboard in the in-app browser.
   - Verify no stock T3 copy remains in visible routes or metadata.
   - Check empty, loading, stale, failed, and older-artifact states.
   - Keep the cost and latency guardrails visible so improvements cannot hide regressions.

## Acceptance Criteria

- The home route no longer looks or reads like Create T3 App.
- The UI makes the distinction clear: Briefing Genie is the product; Briefing Genie Improvement Lab is the lab.
- `/genie` and `/lab` are separate routes with distinct page titles, layouts, and visual treatments.
- Single-briefing generation is quick, bounded, and visible from the dashboard.
- A viewer can understand the baseline failure mode in under one minute.
- Eval/lab activity has visual progress and comparison states that can be observed during a live demo.
- The lab includes at least one shadcn chart-driven visualization for run trends or metric deltas.
- The dashboard clearly links metrics to concrete artifacts and evaluator evidence.
- Synthetic datasets are committed as reviewed fixtures, discovered from `data/`, and validated with Zod before use.
- Dataset seeding can create baseline run artifacts and sample traces without live model calls.
- Briefing Genie generation is callable from both the product UX and programmatic lab/eval flows.
- tRPC exposes stable entry points for starting briefing jobs, polling job status, starting eval runs, comparing runs, and listing artifacts.
- Genie generation traces are file-backed and rich enough for the lab to inspect inputs, outputs, tool calls, provider-exposed traces, costs, latency, and errors.
- Evals are owned by the lab side and can run hands-free over multiple cases.
- Older run artifacts remain readable when new optional metrics are added.
- The UI is built from local, inspectable components with shadcn/ui as the preferred source.
- The implementation stays TypeScript-only, with Zod covering LLM/eval/artifact contracts.
- The public repo does not contain private local filesystem paths or private planning-note locations.
- The user can see where Codex's role ends and human judgment begins.
- `mise exec -- bun run check` and `mise exec -- bun run typecheck:native` pass before committing implementation changes.
