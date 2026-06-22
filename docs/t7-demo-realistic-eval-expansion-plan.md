# Phase 7 Demo-Realistic Eval Expansion Plan

Status: deferred until explicitly selected

Parent plans:

- [t3-ux-replacement-plan.md](./t3-ux-replacement-plan.md)
- [t5-expanded-eval-set-plan.md](./t5-expanded-eval-set-plan.md)
- [t6-live-generation-orchestration-plan.md](./t6-live-generation-orchestration-plan.md)

## Objective

Grow the reviewed 9-case corpus into a 25-40 case demo-realistic eval set only when the team is ready to make corpus expansion the active slice.

The goal is not to add schema-valid fixtures quickly. The goal is to create realistic synthetic source packets that can be run through real LLM prompts and produce meaningful measurements of grounding, citation choice, stale evidence handling, recommendation discipline, cost/latency behavior, human approval boundaries, and holdout leakage.

## Current Decision

Do not jump into this immediately.

The current 9-case corpus should remain the default app experience while we use the app, inspect the lab story, and decide whether the next slice should be corpus authoring, evaluator/report hardening, dashboard polish, or another runtime improvement.

Any future expansion should be staged and reviewable. Do not generate 20+ cases in one pass unless there is already a packet-quality review loop that can keep every new case at the same standard as the existing 9.

## Quality Bar

Every new source packet should read like plausible operational source material, not like an eval fixture.

Required packet qualities:

- 5-10 source documents per packet.
- Longer document bodies with realistic context, caveats, decision history, and operational texture.
- Overlapping evidence where more than one source is topically relevant but only some sources support a specific claim.
- Distractors that are plausible enough to test citation selection.
- At least one decision boundary, late caveat, stale source, unresolved approval, source disagreement, or missing-data edge.
- Public-safe synthetic details with no private paths, real customer identifiers, secrets, or vendor-confidential details.
- Enough source text that a good model must prioritize and synthesize rather than copy every sentence.

Required case qualities:

- A realistic user request that someone would plausibly give Briefing Genie.
- Expected coverage derived from the source packet after the packet is written, not invented first and backfilled with documents.
- Traps that correspond to realistic model failures.
- Accepted citations that test support quality, not just citation presence.
- Failure tags aligned to the demo story and evaluator/reporting needs.
- Clear holdout and demo-highlight metadata.

## Authoring Sequence

Use a packet-first workflow:

1. Choose a failure mode and a realistic product situation.
2. Draft the source documents as if they came from real operational artifacts: memos, QA logs, incident notes, support digests, finance reviews, legal/security guidance, customer-success notes, analytics summaries, design reviews, and decision trackers.
3. Review the source packet in the app or as raw JSON before writing eval labels.
4. Derive the eval case from the packet: task, expected coverage, traps, accepted citations, and failure tags.
5. Run `mise exec -- bun run data:validate`.
6. Run at least one real or local generated briefing and inspect whether the output failures are interesting.
7. Keep the case only if it would teach us something about prompt/model behavior.

## Expansion Stages

Stage 0: keep the current 9

- Leave the app on the reviewed corpus.
- Use the app to identify what kinds of cases are missing.
- Do not add generated placeholder cases.

Stage 1: add 3-5 candidate cases

- Add one small batch focused on the highest-value missing failure modes.
- Prefer depth over breadth.
- Review source packet realism before refreshing artifacts.
- Keep only cases that produce meaningful LLM behavior.

Stage 2: reach 15-18 cases

- Add repeated examples for the main failure modes.
- Refresh seeded or generated artifacts only after the cases are accepted.
- Check that `/genie` still feels usable and not cluttered.

Stage 3: reach 25-40 cases

- Expand only after the authoring/review loop is working.
- Keep 4-6 highlighted cases for live walkthroughs.
- Keep 5-8 holdout or regression cases out of product/prompt-tuning surfaces.
- Generate baseline and variant run artifacts once the corpus is credible enough to support before/after claims.

## Failure Mode Coverage

The 25-40 case corpus should include repeated, varied examples of:

- Citation grounding: topically related sources versus sources that actually support the claim.
- Stale evidence: early roadmap, old docs, stale PR descriptions, or outdated support snippets contradicted by later artifacts.
- Unsupported recommendations: adoption or coverage improvements turned into rollout claims without approval.
- Cost/latency tradeoffs: trace depth, retry caps, batch size, and progress UX.
- Human approval boundaries: drafting versus customer commitments, policy changes, release blocks, and external sends.
- Holdout leakage: prompt iteration, visible labels, redacted dashboard summaries, and overlap risk.

Repeated examples should not be clones. They should test the same failure class under different source shapes and product situations.

## Run Artifacts

Do not generate baseline artifacts just to make the dashboard look fuller.

Generate or refresh run artifacts when:

- the new cases have passed packet-quality review,
- the corpus size and case mix are intentional,
- the generated outputs are useful to inspect,
- and the report tells a clearer before/after story than the seeded fallback.

When this phase becomes active, add or firm up commands such as:

- `eval:baseline`
- `eval:variant`
- `eval:report`

The dashboard should prefer generated run artifacts only after those artifacts are based on a reviewed corpus. Seeded Phase 5 artifacts should remain the deterministic fallback.

## Acceptance Criteria

- `mise exec -- bun run data:validate` passes.
- Project checks pass before review.
- The app does not show low-realism placeholder packets beside the reviewed corpus.
- New packets meet the longer realistic source-document bar.
- New cases produce meaningful LLM behavior when run through Briefing Genie.
- Failure clusters are backed by repeated patterns, not single anecdotes.
- Holdout labels and expected answers remain out of `/genie` and prompt-iteration surfaces.
- Generated baseline/candidate artifacts are produced only after the corpus is credible enough to support them.

## Non-Goals For Now

- Do not bulk-generate 20+ placeholder cases.
- Do not claim prompt or model improvement from schema-valid but unrealistic packets.
- Do not make generated run artifacts the dashboard default before the expanded corpus is reviewed.
- Do not expand the corpus simply because the parent plan says 25-40 is eventually needed.
