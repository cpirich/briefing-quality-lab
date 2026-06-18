# Phase 5 Expanded Synthetic Eval Set Plan

Status: proposed next slice

Parent plans:

- [t3-ux-replacement-plan.md](./t3-ux-replacement-plan.md)
- [t4-data-contract-run-store-plan.md](./t4-data-contract-run-store-plan.md)

## Objective

Replace the tiny run-store starter fixtures with the first meaningful synthetic eval set for Briefing Genie before investing in live LLM generation and lab-owned eval orchestration.

Phase 4 proved that source packets, eval cases, seeded outputs, traces, evaluator outputs, and comparisons can be committed, discovered, and validated. Phase 5 should make those fixtures large and varied enough to expose real grounding, citation, coverage, and recommendation-quality failures.

## Sequence

This work should happen after the Phase 4 data-contract/run-store merge and before live generation becomes the main implementation focus.

The current three source packets remain useful as golden UI fixtures and schema smoke tests. They should not be treated as enough evidence for prompt, model, or evaluator quality decisions.

## Target Dataset

- 8-12 total eval cases
- 3-4 demo-highlight cases suitable for live walkthroughs
- 1-2 holdout cases with visible summaries but hidden tuning labels
- 3-6 source documents per source packet
- source documents long enough to require selection, synthesis, and citation judgment
- seeded baseline and candidate outputs for every visible case
- evaluator outputs and comparison artifacts that show at least one concrete failure cluster

## Packet Requirements

Each source packet should include enough evidence complexity to make the lab useful:

- relevant facts mixed with distractor details
- overlapping support across sources where citation choice matters
- at least some source tension, stale evidence, missing data, or ambiguity
- enough length that a good briefing must prioritize rather than exhaustively summarize
- public-safe synthetic details with no private local paths, customer identifiers, secrets, or unreleased vendor data

## Case Requirements

Each eval case should include:

- a realistic user request
- expected coverage points
- known traps or ambiguities
- accepted citations
- failure tags
- rubric/evaluator notes
- holdout and demo-highlight metadata

The visible cases should make quality problems legible in the dashboard. The holdout cases should support basic anti-gaming checks without exposing full tuning labels in the product UI.

## Implementation Steps

1. Inventory the Phase 4 starter fixtures and decide which should stay as UI smoke cases versus graduate into the expanded eval set.
2. Draft 8-12 synthetic cases in the developer-tooling / AI-product strategy domain.
3. Author richer source packets under `data/source-packets/`.
4. Author matching eval cases under `data/eval-cases/`.
5. Refresh seeded baseline/candidate briefing outputs under `runs/*/briefings/`.
6. Refresh seeded traces, evaluator outputs, run manifests, comparison artifacts, and latest report text.
7. Run fixture validation and the project checks.
8. Verify `/genie` still feels fast and focused while `/lab` has enough evidence density to explain the eval story.

## Acceptance Criteria

- `mise exec -- bun run data:validate` passes.
- `mise exec -- bun run check` passes.
- The dataset has 8-12 synthetic eval cases.
- Source packets use richer source documents than the Phase 4 smoke fixtures.
- The lab shows meaningful before/after evidence across more than one visible case.
- At least one failure cluster depends on citation grounding or unsupported synthesis, not just missing UI data.
- Holdout cases are marked and do not expose tuning labels in the Genie product surface.
- All committed fixtures remain synthetic and public-safe.
