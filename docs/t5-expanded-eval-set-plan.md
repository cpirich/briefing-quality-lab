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
- 5-10 source documents per source packet, with a target of at least 6 documents in the first implementation pass
- fuller synthetic source documents than the Phase 4 smoke fixtures; each packet should contain enough text that a good answer has to select, synthesize, and cite rather than copy every sentence
- seeded baseline and candidate outputs for every visible case
- evaluator outputs and comparison artifacts that show at least one concrete failure cluster

This phase should stay intentionally small enough to review carefully in one PR. It proves the richer packet shape, seeded artifact flow, holdout filtering, and dashboard evidence density. The seeded baseline/candidate outputs are deterministic stand-ins for stored run artifacts; they should be replaced by real LLM-generated baseline and candidate run outputs once live generation is available.

## Source Packet Scenario

The intended product scenario is that a source packet contains authored, synthetic source documents. Briefing Genie reads those documents and decides which evidence matters for the requested briefing.

This phase should not introduce a hidden upstream process that scans longer documents and pre-selects excerpts. That would make the eval target ambiguous: it would be unclear whether the lab is evaluating Briefing Genie, the excerpt-selection process, or both.

The source schema uses `sources[].body` for the source document text. UI previews, truncation, document drawers, chunking, and readability affordances can be designed later; they should not drive the source-packet scenario.

## Follow-On Dataset Scale

After this Phase 5 PR is reviewed and merged, create a separate PR to grow the dataset to 25-40 cases before using the lab for serious prompt, model, or evaluator improvement claims.

The follow-on expansion should:

- keep 4-6 cases highlighted for demo walkthroughs
- keep 5-8 holdout or regression cases out of the Genie product selector and prompt-tuning views
- add repeated examples per failure mode so clusters are backed by patterns, not anecdotes
- preserve the same Zod-validated fixture and artifact contracts from this phase
- refresh seeded baseline/candidate outputs, traces, evaluator outputs, comparison data, and the latest report

Treat 25-40 cases as the demo-realistic tier for "real improvement work." Treat 60-100 cases as a later hardening tier once live generation, evaluator reliability, runtime cost, and run duration are stable.

## Seeded Outputs And Live Baselines

The Phase 5 seeded baseline and candidate outputs exist so the app can demonstrate the improvement loop before live LLM generation is wired into the repo. They should be plausible stored run artifacts, but they are not the final evidence for model or prompt improvement.

Once live generation exists, the next runtime slice should:

- define an explicit baseline variant with model, prompt, generation settings, and git/runtime metadata
- run that baseline variant across the visible eval cases and write generated outputs to a new `runs/baseline-*` directory
- store baseline traces, evaluator outputs, manifest metadata, and artifact paths with the same schemas used by the seeded artifacts
- compare candidate runs against that generated baseline rather than the hand-authored seeded baseline
- keep seeded baseline/candidate artifacts only as deterministic fallback data for demos, tests, or offline UI work

## Packet Requirements

Each source packet should include enough evidence complexity to make the lab useful:

- 5-10 source documents, not just 3-4 short snippets
- source documents with enough body text to include context, caveats, and decision boundaries
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
5. Refresh seeded baseline/candidate briefing outputs under `runs/*/briefings/` as deterministic stand-ins for stored run artifacts.
6. Refresh seeded traces, evaluator outputs, run manifests, comparison artifacts, and latest report text.
7. Run fixture validation and the project checks.
8. Verify `/genie` still feels fast and focused while `/lab` has enough evidence density to explain the eval story.

## Acceptance Criteria

- `mise exec -- bun run data:validate` passes.
- `mise exec -- bun run check` passes.
- The dataset has 8-12 synthetic eval cases.
- Every source packet has 5-10 source documents.
- Source documents are treated as packet evidence, not pre-selected excerpts from an unstated upstream process.
- Source documents are materially fuller than the Phase 4 smoke fixtures.
- The lab shows meaningful before/after evidence across more than one visible case.
- At least one failure cluster depends on citation grounding or unsupported synthesis, not just missing UI data.
- Holdout cases are marked and do not expose tuning labels in the Genie product surface.
- All committed fixtures remain synthetic and public-safe.
