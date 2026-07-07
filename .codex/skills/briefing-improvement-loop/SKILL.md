---
name: briefing-improvement-loop
description: Operate the Briefing Genie improvement loop for this repo. Use when Codex is asked to inspect eval failures, choose or author a bounded product hypothesis, run the smallest useful Briefing Genie validation, compare baseline and candidate artifacts, update loop state, or recommend ship/iterate/reject/needs-human-review for the Improvement Lab.
---

# Briefing Improvement Loop

Use this workflow to improve Briefing Genie through visible eval evidence, not hidden prompt intuition.

## Required Context

Read these first:

1. `README.md`
2. `AGENTS.md`
3. `docs/briefing-loop-state.md`
4. Latest relevant manifests and comparisons under `runs/`
5. Variant specs under `data/variant-specs/`

Do not tune on holdout cases unless the user explicitly asks for holdout validation.

## Autonomy

If the user says "iterate", continue autonomously through bounded candidate creation, dry-run cost visibility, live matrix execution, verifier comparison, loop-state update, and any eligible promotion attempt until exactly one terminal recommendation is reached: `ship`, `reject`, or `needs human review`.

Do not stop at `iterate` unless another live run would exceed the approved cost cap, require holdouts, require missing secrets, need unavailable tooling, or depend on a human product judgment. Make those blockers explicit and recommend `needs human review`.

## Workflow

1. State the current baseline, candidate, variant, hypothesis, known failure clusters, and human decision needed from `docs/briefing-loop-state.md`.
2. Inspect the latest run artifacts: manifests, evaluator outputs, traces, and comparisons. Prefer visible cases and cite repo-relative artifact paths.
3. Choose one bounded product hypothesis. Tie it to target failure tags and a rollback reason.
4. Select an existing variant spec or add/update one under `data/variant-specs/`. For new loop-engineering candidates, prefer ids that include the loop attempt number and readable hypothesis name, such as `openai-loop-v3-claim-planning`, so run artifact paths line up with the demo/loop-state language. Keep executable variant behavior in TypeScript.
5. Make the smallest implementation change that could test the hypothesis.
6. Run the smallest useful validation command with `mise exec --`, usually:
   - `mise exec -- bun run data:validate`
   - `mise exec -- bun run typecheck:native`
   - a focused eval/report command when live provider scope is approved
7. Compare evidence against the baseline. Check quality, citation support, unsupported claims, cost, latency, guardrails, and artifact completeness.
8. Treat promotion as the ship gate for any demo-facing variant. When a matrix-selected candidate should become demo-facing in `/lab`, promote only a complete run with a matching case set:
   - `mise exec -- bun run eval:promote --baseline=<baseline-run-id> --candidate-run=<candidate-run-id> --label="<candidate label>" --source-matrix=<matrix-id>`
   - Matrix artifacts are loop workbench evidence; promoted `RunComparison` artifacts are the canonical `/lab` comparison story.
   - When a focused matrix selects a promising candidate from an incomplete slice, prefer a candidate-only full visible run against the stored baseline. Do not rerun baseline variants unless the baseline artifact is missing, stale, or has a mismatched case set.
   - Use `mise exec -- bun run eval:variant --provider=openai --evaluator=hybrid --baseline=<baseline-run-id> --variant-id=<winning-variant-id>` for the candidate-only full visible continuation when the winning variant has an active spec under `data/variant-specs/`.
   - Use `--visible-all` for full visible matrix validation instead of listing every visible case id. Continue to exclude holdouts unless the user explicitly approves holdout validation.
   - If promotion fails only because the selected matrix run is an incomplete slice, automatically continue once: run the same winning variant as a full visible-case candidate against the same baseline, excluding holdouts, then retry promotion with `--source-matrix=<matrix-id>`.
   - Do not override the eval runner's default concurrency for that full candidate continuation unless the user explicitly asks or a documented retry/rate-limit recovery requires it.
   - Before that full candidate continuation, make the expected bounds/cost visible. Continue without asking only when `OPENAI_API_KEY` is available, holdouts remain excluded, and the estimated max cost is within the already-approved budget. Otherwise stop with `needs human review`.
   - If the full candidate cannot be generated or promoted, do not recommend `ship` for the variant. Recommend `iterate`, `reject`, or `needs human review` and record the blocker.
9. Do a verifier pass before recommending ship. The author of a change should not be the only judge of success.
10. Update `docs/briefing-loop-state.md` with facts, recommendations, rejected approaches, promoted artifacts, and the next human decision.
11. Stop with exactly one recommendation: `ship`, `iterate`, `reject`, or `needs human review`. Use `ship` for a variant only when the live evidence supports the claim and the canonical `/lab` comparison has been promoted or is already current.

## Environment Loading

Before concluding `OPENAI_API_KEY` is unavailable, check whether `.env.local` exists and whether it contains the key using a presence-only check. Do not print, inspect, or summarize secret values.

When `.env.local` contains `OPENAI_API_KEY`, treat the key as available for approved live-provider gates and source `.env.local` for CLI commands that need live provider access, for example:

`mise exec -- zsh -lc 'set -a; source .env.local; set +a; bun run eval:matrix ...'`

Continue to exclude holdouts unless explicitly approved, and continue to report live-action bounds and estimated max generation cost before spending.

## Guardrails

- Keep `/genie` fast and product-focused; put loop evidence in the Improvement Lab or filesystem artifacts.
- Keep the main demo path TypeScript-only and Zod-validated.
- Use committed synthetic data only. Do not add private paths, secrets, production data, or private planning notes.
- Treat `candidate-citation-gates` as a reference target, not proof of live model improvement.
- Make costs and iteration bounds visible before any live-provider run.
- Prefer small, inspectable artifacts under `docs/`, `data/`, and `runs/`.
