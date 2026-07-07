# T12 Loop Engineering Plan

## Context

This project already frames Briefing Genie as a small AI product and Briefing Genie Improvement Lab as the system for improving it through evals, traces, comparisons, and human judgment. Loop engineering fits the repo because the demo is not just "Codex writes code"; it is "Codex operates an AI-product improvement loop."

The goal of this plan is to add loop-engineering structure in phases without bloating the product surface. Briefing Genie should remain the fast briefing-generation product. The Improvement Lab should become the visible control surface for hypotheses, variants, verifier checks, eval results, and human ship/no-ship decisions.

This plan is based on Addy Osmani's "Loop Engineering" framing: useful loops combine automations, isolated worktrees, skills, plugins/connectors, subagents, and durable state outside a single chat session.

## Principles

- Keep the main demo path TypeScript-only and Zod-validated.
- Treat the loop as product infrastructure, not a hidden prompt trick.
- Prefer small, inspectable artifacts committed under `docs/`, `data/`, and `runs/`.
- Make variants explainable: every variant should have a hypothesis, target failure mode, budget, and rollback reason.
- Split maker and checker responsibilities so the agent that authors a change is not the only one judging it.
- Keep human judgment visible. The loop may recommend, but the human decides whether the eval is valid and whether to ship.
- Avoid recurring live-provider work by default. Automations should start with artifact triage and only run model-backed evals when explicitly configured.

## Implementation Status

Implemented as of 2026-07-01:

- Phase 1 durable Markdown loop state exists at `docs/briefing-loop-state.md`.
- Phase 2 repo-local Codex skill exists at `.codex/skills/briefing-improvement-loop/SKILL.md` and passes skill structural validation.
- Phase 3 variant specs exist for already-implemented variants under `data/variant-specs/`, with Zod validation wired through `src/schemas/index.ts` and `src/run-store/index.ts`.

Not implemented yet:

- Candidate variant selection is intentionally not pre-decided. The current variant specs document the captured OpenAI baseline and local smoke-test baseline only.
- Maker/checker subagents, the focused variant matrix, automation-friendly triage, and the Lab UI loop panel remain future phases.

## Phase 1: Durable Loop State

Create a repo-visible state artifact that lets Codex resume the improvement loop across sessions.

Status: implemented for Markdown state. The optional JSON ledger remains deferred.

### Proposed Files

- `docs/briefing-loop-state.md`
  - Human-readable current loop status.
  - Good for demos and review.
- Optional later: `data/lab-loop/ledger.json`
  - Zod-validated machine-readable loop state.
  - Useful once the Lab UI or scripts need structured access.

### State Fields

- Current baseline run id.
- Current candidate run id.
- Active product hypothesis.
- Target failure tags.
- Variant under test.
- Visible cases used for tuning.
- Holdout status.
- Latest comparison artifact.
- Known failure clusters.
- Rejected approaches and why.
- Next recommended experiment.
- Human decision needed.

### Acceptance Criteria

- A new Codex session can read the state file and understand what to do next.
- The state file contains no private paths, secrets, or production data.
- The state distinguishes facts from recommendations.

## Phase 2: Briefing Improvement Loop Skill

Add a Codex skill that encodes the repeatable improvement loop so future sessions do not rediscover the process from scratch.

Status: implemented as `.codex/skills/briefing-improvement-loop/SKILL.md`. It is structurally valid and can be dry-run by following the checked-in workflow; a fresh Codex session may be needed before `$briefing-improvement-loop` auto-triggers from the skill registry.

### Proposed Files

- `.codex/skills/briefing-improvement-loop/SKILL.md`

### Skill Responsibilities

1. Read `README.md`, `AGENTS.md`, and the loop state file.
2. Inspect latest baseline and candidate manifests under `runs/`.
3. Identify weak eval cases and recurring failure tags.
4. Propose one product hypothesis.
5. Choose an existing variant or recommend a new variant spec.
6. Run the smallest useful validation command.
7. Compare candidate against baseline.
8. Update the loop state file.
9. Stop with one of:
   - ship
   - iterate
   - reject
   - needs human review

### Initial Skill Prompt Shape

```text
Operate the Briefing Genie improvement loop.

Read the loop state, inspect the latest run artifacts, choose one bounded
hypothesis, validate it with the smallest useful eval slice, and update the
state with evidence and a recommendation. Keep Briefing Genie fast and keep
the Improvement Lab focused on observable quality, cost, latency, traces, and
human approval.
```

### Acceptance Criteria

- The skill can be invoked explicitly with `$briefing-improvement-loop`.
- The skill references repo commands with `mise exec --`.
- The skill requires verifier review before recommending ship.
- The skill instructs Codex not to tune against holdouts unless explicitly requested.

## Phase 3: Variant Specs As First-Class Artifacts

Move variant intent into data artifacts while keeping runtime variant construction in TypeScript.

Status: partially implemented. Specs are validated for the existing `openai-responses-v1` captured baseline and `local-extractive-v1` smoke-test baseline. No generated candidate variant has been selected or wired yet.

### Proposed Files

- `data/variant-specs/openai-responses-baseline-v1.json`
- A future candidate spec chosen by the loop, for example `data/variant-specs/openai-grounded-claims-v1.json`
- `src/schemas/variant-specs.ts` or an addition to `src/schemas/index.ts`
- `scripts/validate-data.ts` updates to validate variant specs

### Suggested Variant Spec Shape

```json
{
	"id": "openai-grounded-claims-v1",
	"label": "OpenAI grounded claims variant",
	"status": "candidate",
	"provider": "openai",
	"model": "gpt-5.2",
	"promptVersion": "briefing-genie-grounded-claims-v1",
	"hypothesis": "Requiring claim-level citation discipline will reduce unsupported claims without materially hurting coverage.",
	"targetFailureTags": ["unsupported-claim", "weak-citation-support"],
	"expectedMetricMovement": {
		"citationSupport": "up",
		"unsupportedClaims": "down",
		"latency": "flat-or-up",
		"cost": "flat-or-up"
	},
	"budget": {
		"maxEstimatedCostUsd": 0.25,
		"maxMedianLatencyMs": 10000
	},
	"rollbackReason": "Reject if citation support does not improve or if cost/latency exceeds the demo budget."
}
```

### Acceptance Criteria

- Variant specs are validated with Zod.
- The Lab can eventually show why each variant exists, not only how it scored.
- Runtime code still resolves variants safely through TypeScript functions.
- Baseline spec filenames should make their baseline/reference role obvious, even when the internal variant id matches the runtime id used by traces.
- Variant ids remain lowercase, hyphenated, and path-safe.

## Phase 4: Maker/Checker Subagents

Add specialized Codex subagents for the loop's main roles.

### Proposed Files

- `.codex/agents/eval-failure-analyst.toml`
- `.codex/agents/variant-author.toml`
- `.codex/agents/lab-verifier.toml`
- Optional later: `.codex/agents/demo-narrator.toml`

### Agent Roles

`eval-failure-analyst`

- Read-only by default.
- Inspects manifests, evaluations, traces, and comparisons.
- Clusters failures by case, rubric dimension, and failure tag.
- Recommends one bounded hypothesis.

`variant-author`

- Implements a prompt, variant, or schema change.
- Keeps changes scoped to the active hypothesis.
- Updates variant specs when variant intent changes.

`lab-verifier`

- Runs data validation, typecheck, focused evals, and comparisons.
- Challenges whether the evidence supports the recommendation.
- Checks cost, latency, holdout safety, and artifact completeness.

`demo-narrator`

- Converts run evidence into concise demo language.
- Produces a human-readable before/after summary.
- Does not decide whether to ship.

### Acceptance Criteria

- The author and verifier roles are separate.
- The verifier can reject a candidate even when tests pass.
- Subagents are used only when their second opinion is worth the token cost.

## Phase 5: Focused Variant Matrix

Add a bounded matrix runner that tests several variants against a small visible slice before spending on full runs.

### Proposed Command

```bash
mise exec -- bun run eval:matrix
```

### Matrix Behavior

- Select 2-4 variants.
- Select 3-5 visible eval cases.
- Exclude holdouts by default.
- Run OpenAI/hybrid mode by default because local/deterministic results are too weak to guide useful variant selection.
- Keep the matrix intentionally small so provider cost stays low and the loop does not drift into unbounded iteration.
- Optionally support local/deterministic mode later as an offline smoke test, not as the primary decision signal.
- Preserve the existing full-run comparison guardrail: `eval:variant` should continue to reject filtered candidates when the selected case set does not match the baseline case set.
- Implement the matrix as a separate bounded mini-run flow rather than weakening pairwise comparisons. The matrix runner should create small matrix-specific run directories for each variant/case slice and write a dedicated matrix artifact under `runs/comparisons/matrices/`.
- Matrix artifacts should point to inspectable mini-run manifests, briefings, traces, and evaluator outputs, but should not masquerade as pairwise `RunComparison` artifacts.

### Matrix Metrics

- Overall score delta.
- Grounding score delta.
- Coverage score delta.
- Citation support delta.
- Unsupported claims.
- Median latency.
- Estimated generation cost. Evaluator cost should be reported separately on run manifests; budget comparisons do not combine it with generation cost, and the current tools cannot enforce evaluator-spend limits.
- Guardrail status.

### Acceptance Criteria

- The command can identify promising variants before full eval runs.
- Matrix artifacts are Zod-validated.
- The Lab can later render the matrix as rows for cases and columns for variants.
- The matrix never tunes on holdouts by default.
- The matrix has explicit iteration bounds: case count, variant count, retry cap, and estimated generation cost must be visible before a run starts.

## Phase 6: Automation-Friendly Triage

Add a cheap recurring command that summarizes existing artifacts and recommends next work without making live provider calls.

### Proposed Command

```bash
mise exec -- bun run lab:triage
```

### Triage Behavior

- Validate data fixtures.
- Read latest run manifests.
- Read latest comparison artifacts.
- Identify stale or missing artifacts.
- Summarize current weakest failure clusters.
- Update `docs/briefing-loop-state.md`.
- Exit without calling OpenAI unless an explicit live flag is added later.

### Automation Use

A Codex Automation could run this periodically and route non-empty findings to the triage inbox. The automation prompt should call the skill rather than embedding a long prompt directly.

### Acceptance Criteria

- Triage is safe to run frequently.
- Triage is low-cost and does not require `OPENAI_API_KEY`.
- Triage output is useful even when no code changes are made.

## Phase 7: Lab UI Loop Panel

Expose loop state in `/lab` so the demo has a visible control surface for loop engineering.

### UI Placement

Add a compact "Improvement Loop" panel to the Lab dashboard.

### Panel Content

- Active hypothesis.
- Baseline run.
- Candidate run.
- Variant under test.
- Verifier status.
- Latest score delta.
- Cost and latency guardrails.
- Holdout status.
- Next recommended action.
- Artifact links.
- Human decision needed.

### Acceptance Criteria

- The panel is dense and operational, not a marketing section.
- The panel links to existing run artifacts.
- The panel makes clear when a recommendation is not yet verified.
- Briefing Genie `/genie` remains a fast product surface and does not inherit lab complexity.

## Suggested Implementation Order

1. Add `docs/briefing-loop-state.md`. Done.
2. Add `.codex/skills/briefing-improvement-loop/SKILL.md`. Done.
3. Add `lab-verifier` and `eval-failure-analyst` subagents.
4. Add Zod-validated variant specs. Partially done for existing baseline variants; candidate specs should be added only after the loop selects a candidate.
5. Add `eval:matrix` with OpenAI/hybrid defaults and bounded run controls.
6. Add `lab:triage`.
7. Add the Lab UI loop panel.
8. Consider a Codex Automation or recorded-demo workflow after the local loop is useful manually.

## Demo Story

The final demo, whether run live or recorded locally, should show Codex doing the following:

1. Reads durable loop state.
2. Finds a failure cluster in prior eval artifacts.
3. Proposes a variant hypothesis.
4. Implements or selects the variant.
5. Runs a focused eval slice.
6. Invokes a verifier pass.
7. Updates the loop state.
8. Shows the Lab panel with evidence.
9. Ends with a human-facing recommendation.

The important story is not that the loop removes the engineer. The story is that the engineer designed a better improvement system, and Codex can operate that system with visible evidence. A recorded local demo is acceptable, and may be preferable, if it makes the provider-backed loop more reliable and easier to narrate.

## Resolved Decisions

- TypeScript remains authoritative for executable variant definitions at first; JSON variant specs provide explanatory metadata for the Lab.
- `eval:matrix` should use OpenAI/hybrid by default because the local/deterministic signal is currently too weak. Control cost through small case/variant counts, retry caps, and visible estimates rather than by defaulting to local evaluation.
- Loop state starts as Markdown in `docs/briefing-loop-state.md`; add a Zod-validated JSON ledger only when scripts or the Lab UI need structured state.
- Unsupported claims are the first hard ship blocker, followed by citation support, holdout regression, estimated generation cost, and latency.
- The product should support a reliable local recorded-demo workflow as well as a live walkthrough. Automations remain a follow-on once the manually triggered loop is dependable.
