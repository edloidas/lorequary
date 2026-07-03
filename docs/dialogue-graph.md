# Dialogue Graph System

Design spec for the unified dialogue graph: node kinds, edge model, connection rules, validation, and traversal semantics. Supersedes the connection-related parts of `prd.md` (§ Data Model) where they conflict. Informed by the Disco Elysium / Pixel Crushers architecture research (nodes = dialogue entries, links = condition-routed edges, checks as fields on entries) and by the Order of Lust dialogue implementation (entry checks, stage presentation, d20 rolls).

Status: approved design, 2026-07-03. Implementation pending.

## The Universal Rule

**Every connection is a persisted edge, and every edge leaves a port.**

A port is one of:

| Port | Source node | Edge `role` |
| --- | --- | --- |
| Line output | `line` (no check) | `flow` |
| Line check success / failure | `line` (with entry check) | `success` / `failure` |
| Hub output | `hub` | `flow` |
| Option output | `choice` (option without check) | `flow` |
| Option check success / failure | `choice` (option with check) | `success` / `failure` |

Routing from any port follows one rule everywhere: **edges of that port are sorted by `priority` (ascending), and the first edge whose `conditions` all pass wins.** A port may have any number of edges; zero edges on a line/hub port means the dialogue ends there (reader shows END; a non-choice next node is offered as CONTINUE).

Success and failure ports may target the same node (1-to-1 with outcome-specific text/effects) or different nodes (1-to-2).

There are no other connection mechanisms. `ChoiceOption.targetNodeId`, `SkillCheck.successTargetId`, and `SkillCheck.failureTargetId` are removed. The editor no longer synthesizes display-only `check:*` edges.

## Node Kinds

```typescript
type NodeKind = 'line' | 'choice' | 'hub' | 'jump';
```

### line

A piece of content that flows forward. Speaker, text, text variants, passive check, conditions, effects — as before. Two additions:

- **Entry check** (`check?: SkillCheck`): a dice check resolved when the line is *shown*, not chosen — e.g. a Perception roll as the player opens a door. On entry: roll, display `text` (success) or `failureText` (failure), route from the `success`/`failure` port. `checkType` governs persistence: `red` = rolled once per playthrough, result remembered on revisit; `white` = re-rolled on each visit. Static (no-roll) branching needs no entry check — that is plain conditions on nodes/edges.
- **Stage overrides** (`stage?`): see Presentation below.

Lines without a check may have multiple outgoing `flow` edges routed by the universal rule (state-based forks without helper nodes).

### choice

An interactive decision point with 1+ options (typically 2+). All option targets live in edges. A dialogue's entry node must not be a choice — threads always open with content.

### hub

An invisible junction (articy Hub / Pixel Crushers group node). No text, no speaker, no passive check. Keeps `conditions` (entry gate, skip-on-fail like a line) and `effects` (run on pass-through). On enter: apply effects, immediately route onward. Hubs are the tool for "return to topics" loops and conditional fan-out after a choice option.

### jump

A go-to reference (Pixel Crushers cross-conversation link). Carries:

```typescript
type JumpTarget = {
  dialogueId?: string;   // omitted = current dialogue
  nodeId?: string;       // omitted = target dialogue's entryNodeId; required for same-dialogue jumps
};
```

At least one field must be set (enforced by the Zod schema); an empty `JumpTarget` is rejected at parse time. A jump node has **no outgoing edges** — its target is the reference. Same-dialogue jumps move to the target node; cross-dialogue jumps switch the playthrough's active dialogue. No return stack in v1 (DE's `Push/PopConversationPosition` is deferred until needed).

## Schema Changes

### DialogEdge

```typescript
type EdgeRole = 'flow' | 'success' | 'failure';

type DialogEdge = {
  id: string;
  source: string;            // node id
  sourceOption?: string;     // option id, required when source is a choice node
  role: EdgeRole;            // 'success'/'failure' only from a check-bearing line or option
  target: string;            // node id
  conditions?: string[];     // implicit AND, evaluated during routing
  effects?: string[];        // applied when this edge is traversed (articy pin instructions)
  priority?: number;         // ascending sort; default 0
  label?: string;            // author annotation, rendered on canvas
};
```

`sourceHandle`/`targetHandle` are removed from the domain schema. The web adapter maps `(sourceOption, role)` to ReactFlow handle ids deterministically (`out`, `out:success`, `out:failure` for lines/hubs; `optionId`, `${optionId}:success`, `${optionId}:failure` for options) and all inputs to a single `in` handle.

**Edge effects** carry outcome-specific consequences — "success heals, failure hurts, both continue to the same node" is two edges to one target, each with its own `effects`.

### Where effects live (authoring guidance)

- **Option effects** — the cost of choosing ("Give money" carries `hero.money -= 100`; the UI may render the change next to the option text).
- **Edge effects** — consequences of an outcome or of taking a particular path.
- **Node effects** — things that happen because content was shown.

### ChoiceOption

```typescript
type ChoiceOption = {
  id: string;
  text: string;              // short menu/button text (unchanged meaning)
  spokenText?: string;       // full spoken player line emitted on selection; own loc key
  lineKey?: string;
  conditions?: string[];
  visibility: ChoiceVisibility;   // unchanged
  lockReason?: string;
  skillCheck?: SkillCheck;
  effects?: string[];
};
```

`targetNodeId` removed. `spokenText` is the menu-text/spoken-text split (articy MenuText vs DialogueText): when set, the playtest/reader emits it as a player line after selection; when unset, nothing extra is spoken. Localization key: `{dialogueId}.{nodeId}.option.{optionId}.spoken`.

Lock semantics carry over unchanged and cover the known cases: `locked_visible` (greyed with `lockReason`), `locked_hidden` (spoiler-safe: lock shown, content hidden), `locked_used` (failed red check, no retry), `invisible`.

### SkillCheck

```typescript
type SkillCheck = {
  skillId: string;
  baseDifficulty: number;    // plain DC (no DE tier-index encoding)
  checkType: 'white' | 'red';
  modifiers?: CheckModifier[];   // unchanged: { condition, bonus, description }
};
```

Used in two positions: `option.skillCheck` (active check, player-triggered) and `line.check` (entry check, rolls on show). Targets removed; outcomes are `success`/`failure` edges. Resolution: `roll + skill + gated modifiers >= DC`, with the roll formula and crit rules taken from project settings. White checks retryable, red checks lock (`locked_used` for options; sticky result for lines).

### PassiveCheck

```typescript
type PassiveCheck = {
  skillId: string;
  threshold: number;
  mode?: 'atLeast' | 'below';   // default 'atLeast'; 'below' = anti-passive
};
```

`below` implements DE anti-passive checks (line shows only when the skill is *under* the threshold). Passive checks never roll — they gate visibility only.

### DialogNode

`kind` extended to the four kinds. Additions to line nodes:

```typescript
// line only
check?: SkillCheck;          // entry check, rolls on show
failureText?: string;        // shown instead of text when the entry check fails; own loc key
stage?: Record<string, string>;       // stageSlotId -> option, overrides dialogue defaults
expression?: Record<string, string>;  // expressionSlotId -> option (replaces single expressionId)

// jump only
jumpTarget?: JumpTarget;
```

`failureText` localization key: `{dialogueId}.{nodeId}.failureText`. Text variants apply to the success text; failure-text variants are deferred.

`expression` replaces `expressionId`: a node selects one option per project-defined `ExpressionSlot` (emotion/pose/outfit — OoL's `actorModifiers`). How slot combinations map to portrait/sprite assets stays on the `Character` side and is presentation-only.

For `hub`/`jump`, content fields (`characterId`, `text`, `textVariants`, `passiveCheck`, `check`, `options`, `stage`, `expression`) are absent; Zod schemas enforce per-kind shape via a discriminated union on `kind`.

### Presentation: stage slots (project-defined, nothing hardcoded)

Backgrounds/places are one instance of a general need (place, music, weather, CG visual). Rather than a hardcoded `placeId`, the project defines **stage slots**, mirroring the existing `ExpressionSlot`/custom-fields pattern:

```typescript
type StageSlot = {
  id: string;
  name: string;              // 'place', 'music', 'visual'
  options: string[];         // author-defined values
};

// ProjectSettings
stageSlots?: StageSlot[];

// Dialogue
stageDefaults?: Record<string, string>;   // slotId -> option, the dialogue's baseline
```

A line's `stage` overrides the dialogue's `stageDefaults` per slot; unset slots inherit. The default project template ships with a `place` slot so the common case works out of the box. The playtest/reader surfaces the resolved stage state; asset mapping is the game's concern.

### Check roll settings (project-level)

```typescript
// ProjectSettings
checkRoll?: {
  formula: '2d6' | '1d20';   // default '2d6'
  critFail?: boolean;        // minimum roll always fails (default true)
  critSuccess?: boolean;     // maximum roll always succeeds (default true)
};
```

DE uses 2d6 with both crits; Order of Lust uses d20. The engine reads this instead of hard-coding 2d6.

## Connection Rules

### Canvas hard-blocks (`isValidConnection`)

Structurally invalid connections are refused at drag time:

1. Self-loops (`source === target`).
2. Any edge out of a `jump` node.
3. A duplicate edge: same (source, sourceOption, role, target) already exists.
4. `success`/`failure` edges from a line without an entry check or an option without a skill check.
5. Connections not ending at a target's `in` handle.

### Validation flags (sketch freely, ship clean)

Live validation in `packages/core/src/validate/graph.ts`, single edge-walking pass:

| Code | Severity | Rule |
| --- | --- | --- |
| `broken-edge` | error | edge `source`/`target` node missing |
| `broken-option-ref` | error | edge `sourceOption` not found on source node |
| `role-mismatch` | error | `success`/`failure` edge but source has no check (e.g. check deleted after wiring); or `flow` edge from a checked line / check-bearing option |
| `broken-jump` | error | `jumpTarget` dialogue/node does not resolve |
| `jump-has-edges` | error | outgoing edges from a jump node |
| `empty-choice` | error | choice node with no options (unchanged) |
| `choice-entry` | error | dialogue `entryNodeId` points at a choice node |
| `unknown-stage-slot` | error | `stage`/`stageDefaults` key not in `stageSlots`, or option not in the slot's options |
| `missing-outcome` | warning | checked line or check-bearing option lacking a `success` or `failure` edge |
| `dangling-option` | warning | option port with zero edges |
| `dead-hub` | warning | hub with zero outgoing edges |
| `unreachable-node` | warning | no path from entry via edges ∪ jump targets (unchanged code, one walker) |

Existing checks (`missing-entry`, `duplicate-node-id`, `missing-character`, `unknown-skill`, `invalid-expression`, `empty-text`) carry over; `unknown-skill` also covers `line.check`; `orphaned-option` is subsumed by the edge rules. `empty-text` does not apply to hub/jump.

Reachability: follow all edges plus same-dialogue jump targets. Cross-dialogue jump targets are validated for existence at project scope but are sinks for per-dialogue reachability.

## Traversal Semantics

Fixed skip semantics, no per-node block/passthrough knob:

1. **Eligibility** (unchanged concept): a node is eligible if its passive check (per `mode`) and `conditions` pass. Ineligible lines/hubs are skipped — traversal continues from their ports. This is the internal-voice mechanic. A skipped checked line does not roll; traversal passes through via its `success` port (edge conditions still apply). The failure branch is only reachable through an actual roll.
2. **Routing primitive**: `nextTarget(port)` — priority-sorted edges of that port, first passing `conditions` wins; the winning edge's `effects` are applied on traversal. The only routing code path.
3. **advance()** from a line: if the line has an entry check, resolve it on enter (per `checkType` persistence), pick `text`/`failureText`, then route from the corresponding outcome port. Otherwise route from the `flow` port. Ineligible nodes are skipped up to `MAX_SKIP_CHAIN` hops (hubs count as hops).
4. **choose(optionId)**: apply option effects; if no check, route from the option's `flow` port (emit `spokenText` first if set). If checked, resolve the check with project roll settings, record the roll, then route from the `success` or `failure` port. Conditional post-outcome branching = multiple edges on one outcome port.
5. **hub**: apply effects, route immediately.
6. **jump**: same dialogue → `moveTo(nodeId)`; cross-dialogue → switch active dialogue inside the `Playthrough` (variables, seen counts, check results persist across the switch), enter target node (entry node if `nodeId` omitted).
7. **End**: a port with no valid edges ends the dialogue. Reader semantics: END when nothing follows; CONTINUE affordance when the next node is not a choice; choices render their options.
8. **State**: the engine tracks per-node seen counts (`seenCount()` in expressions), stored check results (entry checks and red locks), and anything the author flags manually via effects — both automatic and on-demand tracking are available.

## Editor Canvas

- Delete the synthetic `check:*` edge generator in `packages/web/src/modules/workspace/flow/adapter.ts`; render persisted edges styled by `role` (existing violet flow / dashed green success / dashed red failure styles).
- Checked lines and check-bearing option rows get dedicated **pass/fail pins** instead of the fill-success-then-failure drag heuristic.
- New node components: **hub** (compact junction) and **jump** (compact node with dialogue/node target picker; double-click navigates to the target, cross-dialogue included).
- Quick-add menu (open pin click / drop on canvas) gains Hub and Jump entries.
- `isValidConnection` implements the hard-block list; valid drop targets keep the existing green highlight.
- Inspector: option editor gains `spokenText`; line editor gains entry check + `failureText` + stage/expression slot pickers; check editor loses target pickers (edges own targets); edge inspector edits `label`, `conditions`, `effects`, `priority`.
- Options may render their effects as a change preview (e.g. "Give money (−100 gold)") — presentation of option `effects`, no schema support needed.

## Migration

`schemaVersion` bump; one-way migrator in `packages/core/src/serial/`:

1. **Edges**: existing edges get `role: 'flow'`; `sourceHandle` (option id by convention) becomes `sourceOption` when it matches an option on the source node; `targetHandle` dropped.
2. **Option targets**: current data stores option targets twice (option `targetNodeId` and a real edge with `sourceHandle === option.id`). Prefer the existing edge; create a `flow` edge only when missing; drop `targetNodeId`.
3. **Check targets**: `successTargetId`/`failureTargetId` become `success`/`failure` edges from the option; drop the fields.
4. **Expression**: `expressionId` maps to `expression` keyed by a default slot when expression slots exist, else dropped with a migration note.
5. **New fields** (`check`, `failureText`, `stage`, `spokenText`, edge `effects`, `stageSlots`, `checkRoll`, passive `mode`): optional, absent in old data, no migration needed.
6. Conflicts (e.g. `targetNodeId` disagreeing with the edge) resolve in favor of the edge; the migrator reports such repairs.

The demo template "The Harbor Gate" is rewritten natively in the new schema, exercising every new construct: hub loop, jump, anti-passive line, entry check with shared target and per-edge effects, conditional outcome edges, stage slots, and a d20 override example is added to docs (demo stays 2d6).

## Testing

- **Migrator**: fixture tests — old-format JSON in, valid new-format project out; conflict-repair cases; round-trip serialize/deserialize.
- **Validation**: one test per new rule code; regression tests that the old dual-path reachability cases still pass with the single walker.
- **Engine**: routing table tests (multi-edge ports with priorities/conditions, hub chains and skip limits, both jump flavors, option-check and entry-check outcome routing with conditional edges and edge effects, red entry-check stickiness vs white re-roll, anti-passive eligibility, `spokenText` emission, stage resolution with dialogue defaults and node overrides, d20 vs 2d6 formulas with crit rules, red-check lockout across a jump).
- **Web**: adapter mapping tests for handle ids and role styling, `isValidConnection` cases.
- Gate: `vp run check` and `vp test --run` green in all packages.

## Out of Scope (deliberate)

- `falseConditionAction` (block/passthrough knob) — fixed skip semantics chosen.
- Conversation return stack (`Push/PopConversationPosition`) — until investigative sub-conversations demand it.
- DE difficulty tier-index encoding — plain DCs.
- Distinct node kinds per speaker type (npcLine/skillLine/playerOption) — speaker stays a property, per PRD philosophy.
- Text interpolation (`%HERONAME%` / `{hero.name}`) — parser-adjacent feature, tracked in the editor backlog, does not block the graph redesign.
- Failure-text variants (conditional variants of `failureText`) — success-text variants only for now.
- Game-event emission in the expression language — separate design.
