# Lorequary — Product Requirements Document

## Overview

Lorequary is a visual dialogue editor for narrative-driven games in the style of Disco Elysium. It combines a node-based dialogue authoring canvas with a structured lore knowledge base for characters, world state, and game variables. The editor runs as a web SPA with local-first persistence and optional cloud features. The core differentiators are AI-assisted authoring with full graph context, first-class support for skill checks and internal voices, and a shareable reader view for interactive story playback.

## Product Vision

Build the definitive dialogue authoring tool for narrative-heavy games — starting with Disco Elysium-style RPGs, expanding to visual novels, interactive fiction, and TTRPG campaign design.

Three advantages over existing tools:

1. **AI-powered generation** — context-aware dialogue suggestions, branch generation, and character voice consistency using the full graph, characters, and world state as context.
2. **Skill check native** — first-class support for white/red checks, passive skill interjections, locked/visible/hidden choice states, and dynamic difficulty modifiers — features no existing editor provides out of the box.
3. **Web-native and open source** — the editor runs in a browser, works fully offline, and the client is open source. No Windows-only desktop app, no per-seat licensing for the core editor.

## Target Users

**Primary:**

- The developer themselves — building a Disco Elysium-style narrative RPG with skill system, skill checks, internal voices, minimal Sorcery!-style combat, and DE-level exploration. Custom web engine (Three.js + Web UI). This is the dogfooding case that drives every design decision.
- **Narrative designers** authoring branching dialogues for RPGs, adventure games, and narrative-heavy titles.

**Secondary:**

- **Visual novel developers** who need branching with conditions, character expressions, and scene management.
- **TTRPG dungeon masters** building structured campaigns with quest logic, world state tracking, and NPC response trees.

## What Lorequary Is Not

- Not a game engine — it does not run games, manage physics, or render 3D scenes.
- Not a virtual tabletop — no battle maps, tokens, dice rolling UI, or real-time multiplayer gameplay.
- Not a worldbuilding wiki — while it has world notes for AI context, it is not a replacement for World Anvil or Kanka. The knowledge base exists to serve dialogue authoring.
- Not a code editor — authors work visually, not in markup or scripting languages.

---

## Core Concepts

### Two Node Types

Every node in a dialogue graph is one of two fundamental types:

**Line** — a single piece of content (speech, narration, description) that flows forward. A line leads to another line (continue), to a choice (branch), or to nothing (implicit end).

**Choice** — an interactive decision point where the player selects from 2+ options. Each option is a structured object with its own text, conditions, checks, actions, and target.

All other behaviors (conditions, actions, skill checks) are properties of these two node types, not separate nodes.

### Node Properties

Both node types share a common set of properties:

**Input conditions** — conditions evaluated before the node is shown. If conditions fail, the node is skipped (for lines) or the option is displayed according to its visibility setting (for choices). This enables passive skill checks: a line from a skill voice is only shown if the skill meets the threshold.

**Output actions** — side effects that execute when the node is entered. Examples: set a variable (`karma += 1`), emit a game event (`camera_focus(merchant)`), modify a stat (`health -= 10`).

**Conditional text variants** — the same node can display different text based on conditions. Example: different pronouns for male/female player character, different tone based on reputation level. This is not separate nodes — it is variant text within one node, selected by conditions at runtime.

### Choice Option States

Each option within a choice node has a visibility setting that determines how it appears to the player:

| State | Player sees | Behavior |
|---|---|---|
| **Available** | Normal option text | Can select |
| **Available + check passed** | Option text with success indicator | Can select, check already resolved |
| **Locked (visible)** | Option text in inactive/grey color with lock reason | Cannot select, sees what they're missing (e.g., "[Rhetoric 12 — Challenging]") |
| **Locked (hidden content)** | Generic locked indicator, content hidden | Cannot select, doesn't know what the option is |
| **Locked (used/failed)** | Greyed out option with failure indicator | Already attempted, cannot retry (red checks) |
| **Invisible** | Nothing | Option is completely hidden |

Each option configures: `visibility: 'available' | 'locked_visible' | 'locked_hidden' | 'locked_used' | 'invisible'`, plus `lockReason?: string` for display.

### Skill Checks

Two types, following the Disco Elysium model:

**White checks** — can be retried. If the player fails, they can return later when they have higher skill or have found modifiers (new evidence, items, etc.) that lower the DC.

**Red checks** — one attempt only. Failure is permanent and the option transitions to `locked_used` state.

A skill check is attached to a choice option (not a separate node). It defines:

- `skillId` — which skill is tested
- `baseDifficulty` — the DC number
- `checkType` — `'white' | 'red'`
- `modifiers` — array of conditional bonuses/penalties (e.g., "Found the diary (+1)" applies if `world.found_diary == true`)
- Two targets: `successTargetId` and `failureTargetId`

### Passive Checks (Skill Interjections)

A line node can have a `passiveCheck` property: `{ skillId, threshold }`. The line is only visible if the player's skill value meets the threshold. This is how internal voices work — a line spoken by the Empathy skill only appears if Empathy ≥ 8.

Passive checks are not interactive — there is no roll, no success/failure. The line either shows or doesn't.

### Internal Voices

Skills can speak as characters. A skill voice is a character entity with `type: 'skill_voice'` and a reference to a skill variable. When a line node has a skill voice as its speaker and a passive check, the effect is: "if your Empathy is high enough, Empathy speaks to you mid-conversation."

This is not a special system — it emerges from the combination of characters (with type), lines (with speaker), and passive checks (with threshold). The editor does not hardcode "internal voices" as a feature; it provides the primitives that enable them.

### Visual Grouping

Dialogue graphs can become visually overwhelming at 30-60+ nodes. The editor supports visual groups:

- Author can select nodes and group them into a named cluster.
- On the canvas, the group appears as a single collapsed node showing the group name.
- Double-clicking a group enters it (submerge), showing only the nodes inside.
- Breadcrumbs at the top of the canvas allow navigation back to the parent level.
- Groups are purely visual — they do not affect flow logic, export, or runtime behavior.
- Nodes can be ungrouped back to the parent level at any time.

---

## Data Model

### Project Document

The top-level persisted structure:

```typescript
type ProjectDocument = {
  schemaVersion: number;
  meta: ProjectMeta;
  settings: ProjectSettings;
  characters: Character[];
  variables: Variable[];
  dialogues: Dialogue[];
  worldNotes: WorldNote[];
};

type ProjectMeta = {
  id: string;
  name: string;
  createdAt: string;          // ISO 8601
  updatedAt: string;
};

type ProjectSettings = {
  expressionSlots?: ExpressionSlot[];   // project-level expression config
  customCharacterFields?: FieldDefinition[];  // custom fields for characters
  // future: locales, default variable namespaces, etc.
};

type FieldDefinition = {
  id: string;
  name: string;               // 'faction', 'age', 'accent'
  type: 'string' | 'number' | 'boolean' | 'enum';
  enumValues?: string[];       // for enum type
  defaultValue?: string | number | boolean;
};
```

### Characters

```typescript
type Character = {
  id: string;
  name: string;                // internal reference name
  displayName: string;         // shown in dialogue
  type: CharacterType;
  color: string;               // hex color for dialogue UI and node tinting
  portraitUrl?: string;        // default portrait image
  spriteUrl?: string;          // full character sprite
  expressions?: Expression[];  // available expressions/poses
  skillId?: string;            // for skill_voice type — links to a Variable
  customFields?: Record<string, unknown>;  // project-defined custom fields
  metadata?: Record<string, unknown>;
};

type CharacterType =
  | 'character'       // NPC or named character
  | 'player'          // player character (typically one per project)
  | 'skill_voice'     // internal voice / skill speaking
  | 'narrator';       // narrator / system voice

type Expression = {
  id: string;
  name: string;               // 'happy', 'angry', 'suspicious'
  portraitUrl?: string;        // override portrait for this expression
  spriteUrl?: string;          // override sprite for this expression
};

// Configured at project level
type ExpressionSlot = {
  id: string;
  name: string;               // 'emotion', 'pose', 'outfit'
  options: string[];           // ['happy', 'sad', 'angry'] or ['standing', 'sitting']
};
```

### Variables

```typescript
type Variable = {
  id: string;
  name: string;                // display name
  key: string;                 // dot-notation key: 'skills.rhetoric', 'world.baron_alive'
  type: 'string' | 'number' | 'boolean' | 'enum';
  defaultValue: string | number | boolean;
  enumValues?: string[];       // for enum type: ['friendly', 'neutral', 'hostile']
  description?: string;        // for AI context and documentation
  group?: string;              // UI grouping: 'Skills', 'World State', 'Quest Flags'
  computed?: ComputedExpression;  // derived value formula
};

type ComputedExpression = {
  expression: string;          // e.g. 'skills.gold + skills.charisma'
  dependencies: string[];      // variable keys this depends on
};
```

### Dialogues

```typescript
type Dialogue = {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  entryNodeId: string;
  nodes: DialogNode[];
  edges: DialogEdge[];
  editor: DialogueEditorState;   // visual layout — SEPARATED from logic
};

type DialogueEditorState = {
  nodePositions: Record<string, { x: number; y: number }>;
  nodeSizes?: Record<string, { width: number; height: number }>;
  nodeZIndices?: Record<string, number>;
  viewport?: { x: number; y: number; zoom: number };
  groups?: NodeGroup[];
};

type NodeGroup = {
  id: string;
  name: string;
  nodeIds: string[];
  color?: string;
  collapsed: boolean;
};
```

### Nodes

```typescript
type DialogNode = {
  id: string;
  kind: 'line' | 'choice';
  
  // Content
  characterId?: string;          // who speaks — reference to Character
  expressionId?: string;         // which expression to show
  text: string;                  // default text content
  textVariants?: TextVariant[];  // conditional text overrides
  lineKey?: string;              // stable localization key (auto-generated)
  
  // Gating
  passiveCheck?: PassiveCheck;   // skill threshold for visibility
  conditions?: string[];         // entry condition expressions (implicit AND)
  
  // Side effects
  effects?: string[];            // effect expressions, executed on node enter
  
  // Choice-specific
  options?: ChoiceOption[];      // only for kind: 'choice'
  
  metadata?: Record<string, unknown>;
};

type TextVariant = {
  id: string;
  conditions: string[];          // condition expressions — when to use this variant
  text: string;                  // alternative text
  lineKey?: string;              // localization key for this variant
};
```

### Choice Options

```typescript
type ChoiceOption = {
  id: string;
  text: string;
  lineKey?: string;
  targetNodeId: string;
  
  // Availability
  conditions?: string[];         // condition expressions (implicit AND)
  visibility: ChoiceVisibility;
  lockReason?: string;           // shown to player when locked_visible
  
  // Skill check (optional)
  skillCheck?: SkillCheck;
  
  // Side effects on selection
  effects?: string[];            // effect expressions
};

type ChoiceVisibility =
  | 'available'
  | 'locked_visible'
  | 'locked_hidden'
  | 'locked_used'
  | 'invisible';

type SkillCheck = {
  skillId: string;               // reference to a Variable of type 'number'
  baseDifficulty: number;
  checkType: 'white' | 'red';
  modifiers?: CheckModifier[];
  successTargetId: string;       // node to go to on success
  failureTargetId: string;       // node to go to on failure
};

type CheckModifier = {
  id: string;
  condition: string;             // condition expression
  bonus: number;                 // positive or negative
  description: string;           // shown to player: "Found the diary (+1)"
};

type PassiveCheck = {
  skillId: string;               // reference to a Variable of type 'number'
  threshold: number;             // minimum value to show this node
};
```

### Conditions and Effects

Conditions and effects are stored as **plain expression strings**, parsed, validated, and evaluated by `@lorequary/parser` (see `parser.md` for the full language spec):

```json
{
  "conditions": ["hero.money > 50 && npc.aurelia.attitude >= 5"],
  "effects": ["hero.money += 100"]
}
```

- A **condition** is a boolean expression: comparisons, `&&`/`||`/`!`, arithmetic, function calls (`random`, `seenCount`), bare-path shorthand (`quest.baron_alive` ≡ `quest.baron_alive == true`).
- An **effect** is a single assignment: `path op expression` with `=`, `+=`, `-=`, `*=`, `/=`.
- An array of condition strings is implicitly AND-ed; the editor composes AND/OR visually while individual strings stay simple.
- The editor validates expressions on every keystroke against the variable registry; the game runtime parses the same strings at load time and evaluates them against its own state resolver.
- Game-event emission (`emit_event`) is not part of the expression language and will be designed separately.

### Edges

```typescript
type DialogEdge = {
  id: string;
  source: string;              // node id
  target: string;              // node id
  sourceHandle?: string;       // for choice options or check outcomes
  targetHandle?: string;
  label?: string;
  conditions?: string[];       // edge-level condition expressions (evaluated during traversal)
  priority?: number;           // for ordering when multiple edges are valid
};
```

### World Notes

```typescript
type WorldNote = {
  id: string;
  title: string;
  content: string;             // markdown
  tags?: string[];             // for AI context filtering
};
```

### Localization Keys

Every piece of player-facing text gets a stable, auto-generated localization key:

- Node text: `{dialogueId}.{nodeId}.text`
- Text variant: `{dialogueId}.{nodeId}.variant.{variantId}`
- Choice option: `{dialogueId}.{nodeId}.option.{optionId}`
- Lock reason: `{dialogueId}.{nodeId}.option.{optionId}.lock`
- Check modifier description: `{dialogueId}.{nodeId}.option.{optionId}.mod.{modId}`

Keys are generated on node creation and remain stable through edits. Only deletion removes a key.

---

## Architecture

### Repository Structure

Two repositories with a shared npm package.

**Public repo: `lorequary`**

```
lorequary/
├── packages/
│   ├── core/                  # @lorequary/core (npm published, intentionally public API)
│   │   ├── src/
│   │   │   ├── schema/        # all types defined above
│   │   │   ├── serial/        # .lorequary format serialize/deserialize
│   │   │   ├── validate/      # Zod schemas for all types
│   │   │   ├── traverse/      # graph walker, condition evaluator
│   │   │   └── export/        # export adapters (JSON IR, future: Ren'Py, etc.)
│   │   └── package.json
│   │
│   ├── web/                   # React SPA
│   │   ├── src/
│   │   │   ├── app/           # providers, router, boot
│   │   │   ├── routes/        # route definitions
│   │   │   ├── shells/        # app-shell, project-shell, workbench-shell, reader-shell
│   │   │   ├── modules/       # workspace, project, playtest, reader, ai, inspector, persistence
│   │   │   ├── features/      # create-project, generate-with-ai, export-project, etc.
│   │   │   └── shared/        # ui, lib, config, hooks
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── electron/              # Future — wraps web build
│
├── pnpm-workspace.yaml
└── package.json
```

**Private repo: `lorequary-server`**

```
lorequary-server/
├── src/
│   ├── routes/                # Elysia route modules
│   ├── auth/                  # Better Auth config
│   ├── db/                    # Drizzle schema + migrations
│   └── ai/                    # AI proxy (OpenRouter), prompt engineering
├── drizzle/                   # migration files
├── Dockerfile                 # Railway deployment
└── package.json               # depends on @lorequary/core
```

### What Goes Where

**`@lorequary/core` (shared, runtime-neutral):**

- All persisted types and Zod validation schemas
- Serialization/deserialization for `.lorequary` format
- Graph traversal engine (condition evaluation, path walking, skill check resolution)
- Export format adapters
- No React, no browser APIs, no UI

**`web` only:**

- React components, ReactFlow integration
- nanostores (workspace store)
- TanStack Router / Query
- Browser storage (IndexedDB, localStorage)
- Editor commands, UI state, view models

**`server` only:**

- Elysia routes, Drizzle DB, Better Auth
- AI proxy via OpenRouter
- Cloud sync

### API Contract

Elysia generates OpenAPI spec. The web client consumes a generated API client from that spec. No direct type imports across repo boundaries.

---

## Web Application Architecture

### Routing

```
/                                        # Home — project list
/project/:projectId                      # Project dashboard
/project/:projectId/dialogue/:dialogueId # Workbench (editor)
/play/:projectId/:dialogueId             # Reader view (public, shareable)
/settings                                # App settings
/sign-in                                 # Auth (OAuth + email/password via Better Auth)
```

URL search params for bookmarkable editor state:

```
/project/abc/dialogue/xyz?node=node_42&panel=inspector&tab=skills
```

Transient state (viewport, drag, selection set, inline editing, AI sidebar) stays in workspace store only.

### Shell Hierarchy

```
AppShell                              # top bar: logo, breadcrumb, settings, user
├── HomeShell                         # / — project list, create button
├── ProjectShell                      # /project/:id
│   ├── ProjectSidebar                # dialogues, characters, variables, world notes
│   └── ProjectContent
│       └── WorkbenchShell            # /project/:id/dialogue/:id
│           ├── Toolbar               # add node, undo/redo, playtest toggle, lock
│           ├── Canvas                # ReactFlow graph
│           ├── InspectorPanel        # right sidebar — selected node properties
│           └── PlaytestBar           # bottom, collapsible — step-through + var watch
└── ReaderShell                       # /play/:id/:id — completely isolated
    └── ReaderView                    # immersive DE-style playback UI
```

### Workbench Layout

```
┌───────────────────────────────────────────────────┐
│ Toolbar                                           │
│ [+ Line] [+ Choice] | [Undo] [Redo] | [▶ Play]  │
├──────────────────────────────┬────────────────────┤
│                              │    Inspector       │
│         Canvas               │    ┌────────────┐  │
│      (ReactFlow)             │    │ Speaker     │  │
│                              │    │ Text        │  │
│     ┌─────┐    ┌─────┐      │    │ Conditions  │  │
│     │Line │───▶│Choic│      │    │ Actions     │  │
│     └─────┘    └─────┘      │    │ Skill Check │  │
│                              │    └────────────┘  │
├──────────────────────────────┴────────────────────┤
│ Playtest  [◀ Back] [Step ▶] [Reset ↺]   vars: …  │
└───────────────────────────────────────────────────┘
```

Inspector is a right sidebar (not a modal). Resizable. Shows properties of the currently selected node. When nothing is selected, shows dialogue-level properties.

Inline editing: double-click a node on canvas to edit text directly. Only text field — all other properties (speaker, conditions, actions) are edited in Inspector.

### Module Structure

```
modules/
├── workspace/          # canvas, toolbar, commands, history, store
│   ├── ui/             # Canvas, Toolbar, NodeContextMenu, ZoomControls
│   ├── flow/           # ReactFlow adapters, node-registry, edge-registry
│   ├── model/          # workspace nanostore, commands, selection, history
│   └── index.ts
│
├── project/            # project dashboard, CRUD
│   ├── ui/             # ProjectDashboard, DialogueList, CharacterList, VariableManager
│   ├── model/          # project-level state
│   └── index.ts
│
├── inspector/          # right panel — node property editors
│   ├── ui/             # NodeInspector, LineInspector, ChoiceInspector,
│   │                   # ConditionEditor, EffectEditor, SkillCheckEditor,
│   │                   # CharacterPicker, ExpressionPicker
│   └── index.ts
│
├── playtest/           # step-through runner
│   ├── ui/             # PlaytestRunner, VariableWatch, PlaytestControls
│   ├── model/          # playtest engine (uses @lorequary/core traverse)
│   └── index.ts
│
├── reader/             # shareable reader view (isolated)
│   ├── ui/             # ReaderView, DialogueLine, ChoicePanel, SkillCheckResult
│   ├── model/          # reader playthrough state
│   └── index.ts
│
├── ai/                 # AI sidebar and generation
│   ├── ui/             # AISidebar, GenerationPanel
│   ├── model/          # context-builder, API calls
│   └── index.ts
│
├── persistence/        # save/load/export
│   ├── indexeddb.ts    # IndexedDB via idb
│   ├── autosave.ts     # debounced writes (2s)
│   ├── export.ts       # JSON IR, .lorequary format
│   └── index.ts
│
└── lore/               # world notes management
    ├── ui/             # WorldNoteList, WorldNoteEditor
    ├── model/
    └── index.ts
```

### Dependency Rules

```
routes    → shells, features, modules, shared
shells    → features, modules, shared
features  → modules, shared
modules   → shared, @lorequary/core
shared    → @lorequary/core (only when truly needed)
```

`workspace` may import `project`, `inspector`, `playtest`, `ai`. Other modules must not import `workspace`.

### Node Registry

Each node kind maps to a React component for the canvas:

```typescript
const nodeRegistry = {
  line:   LineNode,      // speaker color bar, mini portrait, text preview
  choice: ChoiceNode,    // shows options as compact list with state indicators
};
```

Canvas nodes are compact — they show: type icon, speaker name (colored), first line of text (truncated), badge indicators (passive check threshold, action count, condition count). Full editing happens in Inspector.

Node colors follow the speaker's assigned color.

---

## State Architecture

Three state layers:

```
┌──────────────────────────────────────────┐
│          URL State (TanStack Router)     │
│  projectId, dialogueId, selected node,  │
│  open panel, active tab                 │
├──────────────────────────────────────────┤
│       Workspace Store (nanostores)       │
│  ┌───────────────┬─────────────────────┐ │
│  │  Doc Slice    │ Interaction Slice   │ │
│  │  $nodes       │ $selection          │ │
│  │  $edges       │ $viewport           │ │
│  │  $characters  │ $dragState          │ │
│  │  $variables   │ $clipboard          │ │
│  │  $worldNotes  │ $history            │ │
│  │               │ $playtestState      │ │
│  │               │ $aiSidebarState     │ │
│  └───────────────┴─────────────────────┘ │
├──────────────────────────────────────────┤
│       Server State (TanStack Query)      │
│  Project list, user session,             │
│  cloud sync status (Phase 2)             │
└──────────────────────────────────────────┘
```

### Playtest State

```typescript
type PlaytestState = {
  active: boolean;
  currentNodeId: string | null;
  variableValues: Record<string, string | number | boolean>;
  visitedNodeIds: Set<string>;
  history: PlaytestStep[];
  skillCheckMode: 'random' | 'always_pass' | 'always_fail' | 'manual';
};

type PlaytestStep = {
  nodeId: string;
  choiceOptionId?: string;
  skillCheckResult?: { rolled: number; total: number; dc: number; passed: boolean };
  variableSnapshot: Record<string, string | number | boolean>;
};
```

Playtest scope: single dialogue. Variables reset to defaults on each new playtest run.

### ReactFlow Adapter Contract

1. **Nanostores is source of truth.** ReactFlow never owns canonical data.
2. **ReactFlow is a rendering engine.** It receives derived props and dispatches events.
3. **Adapter layer** (`workspace/flow/adapters/`) translates between nanostore state and ReactFlow events/props. All mapping lives here.

---

## Reader View

The reader view (`/play/:projectId/:dialogueId`) is a completely separate shell with no editor UI. It presents the dialogue as an immersive, playable experience in the style of Disco Elysium.

**Visual style:**

- Dark background, clean typography
- Speaker name colored with character's assigned color
- Character portrait shown alongside dialogue lines
- Location/scene sprite as background or header image
- Skill check presentation: shows skill name, DC, modifiers, and roll result
- Locked choices shown in inactive color with lock reason
- Smooth transitions between lines

**Behavior:**

- Player clicks to advance lines, selects from choices
- Skill checks resolved via random roll (no manual control in reader)
- No variable watch, no graph view, no debug info
- State is not persisted — refreshing restarts from the beginning
- Shareable via URL

**Branding:** No "Made with Lorequary" badge — the reader is hosted on lorequary.com and the context is implicit.

---

## AI Integration

### Architecture: BYOK (Bring Your Own Key)

Users provide their own API keys for AI features. Keys are stored in browser localStorage, never sent to the Lorequary server. API calls go directly from the browser to the AI provider.

Supported providers: OpenAI, Anthropic, Google. Server-managed AI routes through OpenRouter on the Lorequary server.

### Context Building

The AI context sent with each request includes:

- Characters involved in the current dialogue (names, types, descriptions, custom fields)
- Current node text and surrounding graph context
- Current variable state
- World notes (selectable — author can toggle which notes to include)
- System prompt with the node's specific generation instruction

The author can configure per-request what context to include via checkboxes in the AI sidebar.

### AI Capabilities (MVP)

- **Improve text** — rewrite/polish existing node text
- **Generate text** — create new node content from a prompt
- **Generate options** — suggest choice options for a choice node

### AI Capabilities (Post-MVP)

- Generate complete branch continuations (create new nodes and edges)
- NPC personality-consistent dialogue
- Consistency checking across the full graph
- Scene/location description generation
- Skill check suggestion (propose appropriate checks for a scene)

---

## Persistence

### Local Storage

| Storage | Content |
|---|---|
| IndexedDB (via idb) | Project documents, autosave snapshots, checkpoints |
| localStorage | Theme preference, panel state, last project ID, AI API keys, sidebar collapsed |
| Server (Postgres) | Cloud-synced projects, version history |

### File Format

`.lorequary` — JSON serialization of `ProjectDocument` with Zod validation on load.

### Autosave

Debounced at 2 seconds after last edit. Writes current state to IndexedDB.

### Checkpoints

Automatic periodic checkpoints (every 5 minutes or on significant actions like AI generation). Stored in IndexedDB alongside the main document.

Manual save button exists for user reassurance — triggers immediate checkpoint.

### Export / Import

**MVP:** JSON IR export/import (the `.lorequary` format). The `.lorequary` file is the full `ProjectDocument` including `Dialogue.editor` state — it is the app's save format. The game-compatible JSON IR export strips `editor` from each dialogue, producing a runtime-only structure with no layout data.

**Future:** Ren'Py adapter, Unity adapter, Godot adapter, Markdown/PDF for documentation.

---

## Validation

The editor provides automatic validation with visual indicators:

- **Dead ends** — nodes with no outgoing edges (except explicit end nodes)
- **Unreachable nodes** — nodes with no path from any start node
- **Missing variables** — conditions or actions referencing undefined variables
- **Missing characters** — nodes referencing deleted characters
- **Broken edges** — edges pointing to non-existent nodes
- **Empty text** — nodes with no text content
- **Orphaned options** — choice options with no target

Validation runs on demand and shows results as warnings in the toolbar / status bar.

---

## Tech Stack

### Web (Public)

| Tool | Purpose |
|---|---|
| React 19 | UI framework |
| TypeScript 7 (tsgo) | Type safety |
| Vite+ | Build, dev, lint (Oxlint), format (Oxfmt), test (Vitest) |
| TanStack Router | URL state, route layer |
| TanStack Query | Server state (projects, auth, sync) |
| @xyflow/react (ReactFlow) | Canvas rendering, node/edge interaction |
| nanostores | Workspace store |
| Tailwind CSS v4 | Styling |
| Zod | Schema validation |
| idb | IndexedDB wrapper |

### Server (Private)

| Tool | Purpose |
|---|---|
| Elysia | HTTP framework |
| Bun | Runtime |
| Railway | Hosting |
| PostgreSQL | Database |
| Drizzle ORM | Type-safe DB access |
| Better Auth | Authentication |
| OpenRouter | AI proxy |

### Theming

Dark theme by default. Light theme available. User preference stored in localStorage.

### Internationalization

UI language: English. Architecture supports future localization (string keys, not hardcoded text). Dialogue content localization (line keys → locale tables) is a Phase 2 feature.

---

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Undo | Ctrl+Z |
| Redo | Ctrl+Y / Ctrl+Shift+Z |
| Duplicate selected | Ctrl+D |
| Delete selected | Delete / Backspace |
| Toggle inspector | Ctrl+I |
| Lock/unlock selection | Ctrl+L |
| Select all | Ctrl+A |
| Multi-select | Shift+Click / Ctrl+Click |
| Inline edit | Double-click node |

---

## Phased Roadmap

### Phase 0 — Schema and Foundation (2 weeks)

- `@lorequary/core`: all TypeScript types + Zod schemas
- Serialization/deserialization for `.lorequary` format
- Graph traversal engine (condition evaluator, path walker)
- Persistence module (IndexedDB save/load)

### Phase 1 — Core Editor (3 weeks)

- AppShell + ProjectShell + WorkbenchShell (skeleton)
- Home page: project list, create/delete/rename
- Project page: dialogues list, characters panel, variables panel
- Workbench: ReactFlow canvas with line and choice nodes
- Inspector panel: line inspector, choice inspector, condition editor, action editor, skill check editor, character picker
- Node context menu, multi-select, undo/redo
- Visual grouping with submerge/emerge and breadcrumbs
- Inline text editing on canvas
- Autosave to IndexedDB

### Phase 2 — Playtest (2 weeks)

- Step-through playtest runner in bottom bar
- Variable watch panel
- Skill check simulation (random + debug controls)
- Locked/visible/hidden choice state display
- Passive check filtering
- Validation (dead ends, unreachable, missing refs)

### Phase 3 — Reader View (2 weeks)

- ReaderShell: isolated layout, no editor UI
- DE-style visual presentation (dark, portraits, speaker colors)
- Skill check display (roll result, modifiers)
- Choice interaction with state indicators
- Shareable URL (`/play/:projectId/:dialogueId`)

### Phase 4 — AI Integration (2 weeks)

- AI sidebar in workbench
- BYOK key management (localStorage)
- Context builder: graph + characters + variables + world notes → prompt
- AI actions: improve text, generate text, generate options
- Provider support: OpenAI, Anthropic, Google

### Phase 5 — Export and Polish (1 week)

- JSON IR export (ProjectDocument without editor state)
- `.lorequary` file download/upload
- Demo project: one complete DE-style scene from the developer's own game
- Landing page

### Phase 6 — Launch

- Publish to r/gamedev, r/interactivefiction, r/visualnovels, itch.io
- Shareable demo project as showcase
- Collect feedback, iterate

### Future Phases

- Cloud sync and server-managed AI
- Ren'Py export adapter
- Collaboration features
- Advanced AI: branch generation, consistency checking
- Localization pipeline (line keys → CSV/PO export/import)
- Electron desktop app
- Additional export adapters (Unity, Godot, custom JSON)

---

## Open Questions

1. **Skill system specifics** — the developer's game will have ~16 skills in 4 groups. The exact skills are not yet defined. The editor should support N skills flexibly, not hardcode a specific set.

2. **Computed variables** — the expression syntax needs definition. Simple math (`a + b`) or a full expression language? How to handle circular dependencies?

3. **Text variant conditions** — how complex can variant selection be? Simple flag checks, or the same full condition system used elsewhere?

4. **Reader view access control** — is `/play/` public by default or requires a share token? For MVP, public with obscure URL (UUID-based) is probably sufficient.

5. **Multi-dialogue flow** — can a line node link to a node in a different dialogue? Or is cross-dialogue linking a separate "jump" mechanism? For the developer's game (~100 dialogues), this will matter.
