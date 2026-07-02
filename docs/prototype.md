# Prototype Scope and Design

> Decision record and spec for the first working prototype. Approved 2026-07-02.

## Goal

A working editor loop with no server, no AI: open the app, create or load a project, edit branching dialogues on the canvas, debug them in a playtest runner, and save to a local file. `@lorequary/parser` ships to npm so external projects (the game runtime) can consume it.

**Acceptance scenario:** create a project, author a branching dialogue with a white skill check and a passive skill interjection, play it through using skill-check debug modes, export `.lorequary`, reload it, and parse the JSON IR export with `@lorequary/parser` installed from npm in an external project.

## Scope

**In:**

- Line/choice node editing on ReactFlow canvas with inspector panel
- Full skill checks: white/red with modifiers and dual targets, passive checks
- Full PRD character model (types, colors, expressions, portraits, custom fields)
- Text variants and auto-generated localization keys
- Conditions/effects as expression strings, powered by `@lorequary/parser`
- Multi-dialogue projects: sidebar to create/rename/delete/switch dialogues, plus variables and characters panels; no home/dashboard shells — the app opens into the workbench
- Undo/redo via command layer from day one
- Visual grouping: collapse to named cluster, submerge/emerge, breadcrumbs
- Graph validation on demand: broken edges, orphaned options, missing variable/character refs, expression errors, dead ends, unreachable nodes
- Playtest: step-through, choice selection, variable watch, back-step, reset, skill-check modes (random / always pass / always fail / manual)
- Persistence: IndexedDB (via `idb`) with 2s-debounced autosave; `.lorequary` file import/export; JSON IR export (editor state stripped) for game runtimes
- `@lorequary/parser` built with tsdown (Vite+) and published to npm

**Out (deferred):**

- AI features, server, auth, cloud sync
- Reader view (`/play/...`)
- Home and project dashboard shells
- World notes, project-level expression slots
- Dialogue content localization pipeline (keys exist, locale tables do not)
- `emit_event` actions — the expression language is assignments-only; game-event emission needs its own design (PRD follow-up)
- Export adapters beyond JSON IR (Ren'Py, Unity, Godot)

## Key Decisions

| Decision | Chosen | Rationale |
|---|---|---|
| Condition/effect format | Expression strings (`"hero.money > 50"`), not structured JSON objects | Parser spec supersedes the PRD object model. One engine for editor validation and runtime evaluation; strings are compact and diffable. PRD updated to match. |
| Core schema | Rewrite to PRD line/choice model, minus AI-oriented parts | Old npc/player/branch schema predates the PRD and contradicts it. `schemaVersion` covers future additions. |
| Parser authorship | Claude implements directly | Teaching track paused; prototype speed wins. |
| Skill checks | Fully in prototype scope | Core mechanic of the target game; the prototype must prove the real thing. |
| Storage | IndexedDB + file import/export | Matches the PRD end-state; no lost work on tab close. Explicit file export remains the interchange format. |
| Undo/redo | Command-based from the start | Retrofitting undo onto ad-hoc store mutations is the most painful editor refactor. |
| Parser distribution | Publish to npm | Zero-dependency package, public repo, clean semver consumption from the game. |

## Data Model

PRD schema with one systemic change: `Condition[]` → `string[]` (condition expressions) and `Action[]` → `string[]` (effect expressions) in every position — node conditions, choice option conditions, edge conditions, check modifier conditions, text variant conditions, node/option effects.

- Enum variables validate as strings at the parser level; enum-value membership is an editor-level validation concern.
- `ProjectDocument` omits `worldNotes` and `ProjectSettings.expressionSlots` for now.
- `Dialogue.editor` (positions, sizes, viewport, groups) stays separated from logic, exactly per PRD.
- Localization keys auto-generate on node/option/variant creation and stay stable through edits.

## Package Responsibilities

**`@lorequary/parser`** — finish per `parser.md`: lexer, recursive-descent parser, validator, evaluator, extensible function registry (`random`, `seenCount`). Full test suite per module. Add tsdown build and npm publish config. Zero runtime dependencies.

**`@lorequary/core`** — rewritten schema types + Zod validation, `.lorequary` serialize/deserialize, JSON IR export, graph traversal engine (walks nodes/edges, evaluates conditions/effects through the parser, resolves skill checks with injectable RNG so playtest debug modes work), graph validation checks. Depends on `@lorequary/parser`.

**`@lorequary/web`** — the editor SPA. Depends on both.

## Web Architecture

Per PRD: nanostores workspace store is the source of truth; ReactFlow is a rendering layer behind an adapter (`workspace/flow/`); TanStack Router provides the workbench route and URL state. All document edits go through a command layer (do/undo pairs) feeding the history stack. Persistence module wraps `idb`, debounces autosave at 2s, and owns import/export. Playtest engine lives in `playtest/model` and delegates traversal to core.

## Build Order

Hybrid bottom-up: parser first (self-contained, everything depends on it, unblocks npm publishing), then core, then web in vertical slices. Grouping lands last so it can slip without blocking the main loop.

1. Parser: lexer → parser → validator → evaluator → publish setup
2. Core: schema + Zod + serialization + traversal + validation checks
3. Web: canvas CRUD + inspector + undo/redo + autosave
4. Web: file import/export (`.lorequary`, JSON IR)
5. Web: playtest runner with debug controls
6. Web: validation UI
7. Web: visual grouping

Each milestone gates on: tests pass (parser/core), typecheck + tests + manual loop check (web).
