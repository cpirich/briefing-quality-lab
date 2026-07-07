# Candidate-Only Full Visible Validation Plan

## Goal

Speed up the Briefing Genie improvement loop after a focused matrix finds a promising candidate. Instead of rerunning baseline variants in a full visible matrix, run only the winning generated candidate over the complete visible case set and compare it against the stored baseline artifact.

Target command shape:

```bash
mise exec -- bun run eval:variant --provider=openai --variant-id=<variant-spec-id> --baseline=baseline-openai-20260624203921
```

## Current State

`eval:variant` already handles most of the desired full visible behavior:

- With `--baseline=<baseline-run-id>` and no `--case-id`, it selects all non-holdout cases.
- It asserts that the selected candidate case set matches the baseline case set.
- It generates briefings, evaluates them, writes a manifest, and writes a comparison.
- Promotion tooling already accepts a complete candidate run against a stored baseline.

The missing piece is variant-spec selection. Today `scripts/run-eval.ts` calls `generateBriefing({ provider })`, so generation falls back to the provider default instead of a specific `data/variant-specs` candidate.

## Minimal Implementation

1. Add `variantId?: string` to `EvalOptions`.
2. Parse `--variant-id=<id>` in `scripts/run-eval.ts`.
3. Import `listVariantSpecs`, `GenerationVariantSchema`, and `VariantSpec`.
4. Add or share a `variantFromSpec` helper equivalent to the one in `scripts/eval-matrix.ts`.
5. Resolve the selected variant once in `generateRun`.
6. Pass the resolved `GenerationVariant` through `runGeneratedCase` into `generateBriefing({ variant, provider })`.
7. Use the selected variant label and id in the run manifest command and `variantLabel`.

This should be a small, safe change because `generateBriefing` already accepts a `variant` object, and matrix execution already proves that `VariantSpec` can be converted into a `GenerationVariant`.

## Cost Visibility Follow-Up

The skill requires cost visibility before live-provider calls. `eval:variant` does not currently have a dry-run or cost-estimate mode.

Fast interim option:

```bash
mise exec -- bun run eval:matrix --dry-run --visible-all --variant-id=<candidate> --variant-id=<baseline-spec>
```

This is conservative, but it overestimates when the intended continuation only runs the candidate.

Better follow-up:

```bash
mise exec -- bun run eval:variant --dry-run --provider=openai --variant-id=<candidate> --baseline=<baseline-run-id>
```

That dry run should print selected case count, holdout status, model, retry/concurrency settings, and estimated max generation cost without provider calls or artifacts.

## Skill Update

After `--variant-id` support lands, update `.codex/skills/briefing-improvement-loop/SKILL.md` to prefer this path when a focused matrix selects a promising incomplete slice:

```bash
mise exec -- bun run eval:variant --provider=openai --variant-id=<winning-variant-id> --baseline=<baseline-run-id>
```

The skill should continue to require holdouts excluded by default, visible cost bounds before live calls, and promotion only after a complete matching visible case set exists.

## Estimated Effort

- `--variant-id` support for `eval:variant`: 1-2 hours.
- Proper `eval:variant --dry-run` cost estimate: 2-4 hours.

Recommended rollout:

1. Add `--variant-id` support to `eval:variant`.
2. Add `eval:variant --dry-run` and candidate-only cost estimates.
3. Update the improvement-loop skill to use the candidate-only full visible command for promising incomplete matrix slices.
