# Agent Notes

- When running project commands in a non-interactive terminal, prefix them with `mise exec --` so the tools pinned in `mise.toml` are available.
- A project hook runs `mise exec -- bun run check:write` after Codex edit/write tool calls. If a shell command generates or rewrites files, run `mise exec -- bun run check:write` manually afterward.
- Before committing new changes, run `bun run typecheck:native` to catch TypeScript issues quickly.
