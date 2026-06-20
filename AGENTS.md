# Agent Notes

- When running project commands in a non-interactive terminal, prefix them with `mise exec --` so the tools pinned in `mise.toml` are available.
- A project hook runs `mise exec -- bun run check:write` after Codex edit/write tool calls. If a shell command generates or rewrites files, run `mise exec -- bun run check:write` manually afterward.
- Before committing new changes, run `bun run typecheck:native` to catch TypeScript issues quickly.
- Prefer shadcn/ui for reusable React UI primitives and app chrome. Treat shadcn components as open code checked into this repo, then adapt them locally to the product instead of adding a second component library.
- Reserve `src/components/ui/` for shadcn components only, so future shadcn CLI imports do not collide with bespoke demo primitives. Keep non-shadcn local components flat under `src/components/` unless a clearer product-specific folder becomes necessary.
- Use the shadcn CLI, or a shadcn MCP server when it materially helps with browsing, searching, or installing registry components. Skip the MCP path when a simple local component or direct CLI command is faster.
- For this app's dashboard UX, favor dense operational surfaces: tables, tabs, badges, metric summaries, diff views, source/eval artifact links, and clear action controls over marketing-style landing-page sections.
- Keep the app TypeScript-only for the main demo path. Use Zod to make LLM communication, eval cases, evaluator outputs, and persisted artifacts type-safe at runtime and via `z.infer`.
- Prefer `interface` for named object shapes in TypeScript. Use `type` for unions, intersections, mapped/conditional types, and `z.infer` aliases.
- Keep the core app action fast: generating one briefing should feel quick and bounded. Spend the visual complexity on the lab views that show run progress, score deltas, failures, citations, and before/after evidence during a demo.
- Use clear demo nomenclature: "Briefing Genie" is the fast briefing-generation product, and "Briefing Genie Improvement Lab" is the eval/experiment dashboard for improving that product.
- Keep Briefing Genie and the Improvement Lab in the same repo/app, but separate them by route, page title, and visual treatment so they are easy to distinguish in browser tabs and during demos.
- This repo is intended to be public: do not commit private local filesystem paths, secrets, production data, or private planning-note locations.
- Use shadcn theming and shadcn chart components for lab visuals when they help; area charts are a good first choice for run trends.
- Briefing Genie generation must be callable from both the `/genie` UX and programmatic lab/eval flows. Log rich file-backed traces for inputs, outputs, tool calls, tool results, model metadata, cost, latency, errors, and provider-exposed traces or summaries.
- Treat synthetic datasets as committed fixtures under `data/`. Add Zod validation and a seed path before relying on them in the lab.
- Prefer stable tRPC entry points for job control: start/poll briefing jobs, start/poll eval runs, compare runs, and list artifacts.
