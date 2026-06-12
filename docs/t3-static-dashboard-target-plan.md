# Static Dashboard Target Plan

Status: started

Parent plan: [t3-ux-replacement-plan.md](./t3-ux-replacement-plan.md)

## Target

Replace the stock T3 first screen with two route-specific surfaces that make the demo legible before live generation and eval orchestration exist.

## Implemented In This Slice

- `/` redirects to `/lab`.
- `/lab` renders the Briefing Genie Improvement Lab with metric summaries, run comparison, failure clusters, featured case diff, artifact trail, and compact Genie action.
- `/genie` renders the Briefing Genie product surface with a source-packet selector, source excerpts, seeded briefing preview, citations, open questions, and recommendation.
- Shared fixture-shaped data lives in TypeScript so the next slice can migrate it to committed `data/` fixtures and Zod schemas without changing the page structure.
- Route metadata distinguishes `Briefing Genie` from `Briefing Genie Improvement Lab`.

## Remaining Work

- Replace seeded TypeScript constants with validated `data/source-packets/` and `data/eval-cases/` fixtures.
- Install or vendor the shadcn primitives that the app will actually keep, then migrate local UI primitives to that structure.
- Replace the static trend bars with a shadcn/Recharts area chart once chart dependencies are intentionally added.
- Wire the action buttons to tRPC job procedures after the run store exists.
- Add responsive visual QA with the in-app browser after the dev server is running.

## Acceptance Criteria

- The first viewport reads as an operational eval dashboard, not a marketing or framework landing page.
- The lab and Genie pages are visually distinct but share data and component primitives.
- No private paths, secrets, or production data appear in the seeded UI.
- The static UI names the artifact paths that future run-store code will write and validate.
