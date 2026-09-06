# lorequary

Visual editor for branching game dialogs. React 19 SPA — TypeScript, Tailwind v4,
nanostores, ReactFlow, TanStack Router/Query, IndexedDB via `idb`.

`pnpm` workspaces:

- `packages/core` — `@lorequary/core`: domain schema, serialization, validation
  (Zod), graph traversal engine. Runtime-neutral.
- `packages/parser` — `@lorequary/parser`: expression parser, validator,
  evaluator. Runtime-neutral, zero dependencies.
- `packages/web` — `@lorequary/web`: the editor app.

`AGENTS.md` is a symlink to this file — edit `CLAUDE.md`, never replace the symlink.

Make changes and verify them, then stop. Never commit or push unless asked.

## Commands

From the root:

```bash
pnpm dev        # dev server — assume it is already running; start only when
                # explicitly needed, and stop it when done
pnpm build      # clean + typecheck + production build
pnpm check:fix  # fmt + lint + typecheck, every package
pnpm test       # Vitest, watch mode
pnpm test:ci    # single run with coverage
```

Inside `packages/web/` the `vp` CLI is available directly (`vp test --run`,
`vp lint --fix`, `vp run typecheck`). If `vp` is not on `PATH`, use `pnpm exec vp`.

## Constraints

- Import from `vite-plus`, not `vite` or `vitest` — `import {defineConfig} from
  'vite-plus'`, `import {vi} from 'vite-plus/test'`.
- Never install `vitest`, `oxlint`, `oxfmt`, or `tsdown`; Vite+ bundles them. Use
  `vp add` / `vp remove` / `vp dlx`.
- Lint, format, and test config live in each package's `vite.config.ts`. The
  shared base is `tooling/{lint,fmt,test}.ts` at the root; `core` and `parser`
  use it as-is, `web` spreads it and layers the react/jsx-a11y rules on top.
- Typecheck is `tsc` from TypeScript 7 (the native Go compiler; `tsgo`/`@typescript/native-preview` is gone).
- `// *` marks section dividers in large files — the codebase uses them, keep them.
- Docs are flat in `docs/`, lowercase kebab-case, no date or number prefixes.
  `prd.md` is the product spec; the rest are technical specs named by topic.

## Git & GitHub

Do not assume the `gh` CLI is available. Beyond the global conventions:

- **Issue labels:** one main (`bug`, `feature`, `improvement`, `epic`) plus 0–2
  supportive (`UI/UX`, `DX`, `AI`, `wontfix`).
- **Commit with an issue:** `<Issue Title> #<number>` — e.g. `feat: add dialog node
  editor #12`. Without one: `<type>: <description>`.
- **PR title:** `<type>: <description> #<number>`. Multiple issues share one line:
  `Closes #1 #23 #456`.
- **PR body** ends with the session link, and nothing after it:
  `<sub>[Claude Code session](<link>)</sub>`. It is the only attribution — no second
  footer, no `---` rule. Applies to PRs opened from the web too.
- PRs carry a single commit; squash and force-push before merging.
