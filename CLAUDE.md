**lorequary** is a visual editor for crafting branching game dialogs. Stack: React 19, TypeScript, Tailwind CSS v4, nanostores, ReactFlow, Vite Plus. Built as a SPA.

**Monorepo structure** (`pnpm` workspaces):

- `packages/core` — `@lorequary/core`: shared domain schema, serialization, validation (Zod). Runtime-neutral.
- `packages/parser` — `@lorequary/parser`: expression language parser, validator, and evaluator. Runtime-neutral, zero dependencies.
- `packages/web` — `@lorequary/web`: React SPA, the main editor application.

**When running locally, never commit or push changes unless explicitly asked.** Make the changes, verify they work, then stop.

**No AI footers:** Do not add "Drafted with AI assistance", "Generated with …", or similar lines to any output (issues, PRs, commits, comments).

## Commands

Run `vp` commands from within `packages/web/`. From root, prefix with `pnpm --filter @lorequary/web exec` (for `vp` commands) or `pnpm --filter @lorequary/web run` (for scripts).

> **Cloud environments:** If `vp` is not available globally, use `pnpm exec vp ...` as a fallback.

```bash
vp dev              # start dev server — assume it's already running; only start when
                    # explicitly needed and stop it when done testing
vp build            # production build
vp check            # format + lint (no typecheck)
vp test             # run Vitest (watch mode)
vp test --run       # single run
vp lint             # lint with Oxlint
vp lint --fix       # autofix
vp fmt              # format with Oxfmt
vp install          # install dependencies (after pulling changes)
```

**Composite scripts** (via `pnpm` or `vp run` from `packages/web/`):

- `vp run build` — full production pipeline (clean + tsgo + vp build)
- `vp run check` — full check: fmt + lint + tsgo typecheck
- `vp run typecheck` — standalone typecheck (`tsgo --noEmit`)
- `vp run test:ci` — CI test run with coverage

## Documentation

All docs live in `docs/`, flat structure. Lowercase kebab-case filenames, no date or number prefixes. Add subdirectories (`design/`, `decisions/`) only when file count makes flat navigation painful. `prd.md` is the product requirements document; other files are technical specs named by topic (e.g., `parser.md`, `persistence.md`).

## Git & GitHub

Conventional commits: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `ci`. Use raw `git` — do not assume `gh` CLI is available.

### Issue Labels

One **main** label (`bug`, `feature`, `improvement`, `epic`) + 0–2 **supportive** (`UI/UX`, `DX`, `AI`, `wontfix`).

### Issues

- **Title:** `<type>: <description>`
- **Body:** 4–8 sentences (what, affected area, reproduction, impact). Optional sections: `#### Rationale`, `#### References`, `#### Implementation Notes`.

### Commits

- **With issue:** `<Issue Title> #<number>` — e.g. `feat: add dialog node editor #12`
- **Without issue:** `<type>: <description>`
- **Body** (optional): past tense, one line per change, ~2–8 lines, backticks for code refs.
- PRs should contain a single commit; squash and force-push before merging.

### Pull Requests

- **Title:** `<type>: <description> #<number>`
- **Body:** concise what/why, no emojis, one blank line between sections.
- Multiple issues go on one `Closes` line: `Closes #1 #23 #456`.
- End with the session link as the last line, wrapped small: `<sub>[Claude Code session](<link>)</sub>`. It is the only attribution — never append a second generated footer, `---` rule, or promotional line, including on PRs created from the web.

## Toolchain

This project uses [Vite+](https://voidzero.dev/vite-plus) (`vp` CLI) wrapping Vite, Vitest, Oxlint, and Oxfmt. All lint/format/test configs live in `vite.config.ts`. Typechecking uses [TypeScript Go](https://github.com/nicolo-ribaudo/typescript-go) (`tsgo`).

**Rules:**

- Import from `vite-plus`, not `vite` or `vitest` (e.g. `import { defineConfig } from 'vite-plus'`, `import { vi } from 'vite-plus/test'`)
- Don't install `vitest`, `oxlint`, `oxfmt`, or `tsdown` directly — Vite+ bundles them
- Use `vp dlx` instead of `npx`/`pnpm dlx`; `vp add`/`vp remove` for dependencies
