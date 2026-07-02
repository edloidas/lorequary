# Editor UX Backlog

Task list for the dialog editor UI/UX, seeded from a competitive review of Articy Draft 3/X, Arcweave, Yarn Spinner, Twine, ChatMapper, and node-editor conventions from Unreal Blueprint and Blender. Items are ordered roughly by expected impact. Completed items are kept for context until the list is groomed.

## Done (UI modernization pass)

- [x] Left-to-right flow: target pins on the left, source pins on the right of every node.
- [x] Node redesign: speaker-tinted gradient headers, type glyphs, badge row (entry, passive check, variants, conditions, effects), check tags on options.
- [x] Theme: dark blue-tinted `ink` palette, cyan accent, themed edges (violet option links, dashed green/red check outcomes), dot grid, styled minimap with speaker colors.
- [x] Cursor priorities: pane and node body use the default cursor, headers show grab, text shows the text cursor, pins show crosshair.
- [x] Pin affordances: pins grow and glow on hover, unconnected source pins show a `+`, valid drop targets highlight green.
- [x] Quick add: clicking an open pin or dropping a connection on empty canvas opens an "Add connected" menu (Line/Choice) that creates and links the node.
- [x] Skill checks on canvas: pass/fail targets render as display edges; dragging from a check option fills success then failure targets.
- [x] Edge interactions: right-click menu (delete / unlink outcome), drag an edge end to reconnect, drop it on the pane to detach.
- [x] Resizable left/right panels with persisted widths; wider defaults.
- [x] Home screen with project cards (create, open, delete, demo seed) and a project dashboard with Dialogues/Characters/Variables tabs and word counts.
- [x] Playtest side panel: Disco Elysium-style transcript with colored speakers, check-roll banners, choice states, variable watch; active node glows and the canvas follows it while others dim.
- [x] Demo template "The Harbor Gate" exercising passive voices, white/red checks, modifiers, gated options, effects, text variants, and hub loops.
- [x] Chain authoring: `Ctrl+Enter` adds a connected line after the selected node.
- [x] Snap-to-grid (8px) while dragging nodes.

## Next — highest impact

- [ ] **Jump and hub nodes.** Articy-style small junction nodes (hub) and go-to-reference nodes (jump). Disco-style dialogs loop back to question hubs constantly; without these, big graphs turn into edge spaghetti. Requires a schema addition in `@lorequary/core`.
- [ ] **Keyboard graph navigation.** `Alt+Arrow` moves selection to the nearest node in that direction; `Tab` cycles fields; `F2` or `Enter` starts inline editing. Pairs with `Ctrl+Enter` chain-add for mouse-free authoring.
- [ ] **Global search (`Ctrl+K`).** Find text across nodes/speakers/expressions in all dialogues, jump to node; "find usages" for a variable or character.
- [ ] **Menu text vs. spoken text per option/line.** Articy separates short menu text from the full spoken line (plus stage directions). Painful to retrofit later — schema decision to make early.
- [ ] **Auto-layout.** Dagre/ELK left-to-right relayout for the whole graph or the selected subtree, plus align/distribute commands on multi-selection.
- [ ] **Speaker quick-pick on canvas.** Fuzzy speaker autocomplete directly on the node header (click the speaker name), instead of a trip to the inspector dropdown.

## Editor polish

- [ ] Comment/region boxes: resizable tinted rectangles that move contained nodes (Unreal-style), complementing collapse groups.
- [ ] Select upstream/downstream subtree from the context menu.
- [ ] Zoom level-of-detail: below a zoom threshold render title-bar-only nodes for readability and performance.
- [ ] Edge labels: double-click an edge to set a short label; render edge conditions as a badge.
- [ ] Broken-reference styling: edges/options pointing to missing nodes drawn in red with a no-entry marker (Twine-style), synced with validation.
- [ ] Multi-select cut/copy/paste with internal connections preserved, across dialogues.
- [ ] Node resize with content auto-grow (Arcweave-style auto-height is the right default for text-heavy nodes).
- [ ] Drag-from-palette: draggable Line/Choice chips in the toolbar as an alternative to click-to-add.
- [ ] Undo history for `Ctrl+Enter`-created nodes should focus the new node and open inline editing immediately.
- [ ] Option reordering (drag handles) in the choice node and inspector.
- [ ] Skill-check option UX: clarify that dragging from a check option sets pass → fail; consider small dedicated pass/fail pins on the option row.

## Project & content

- [ ] World notes module (`lore/`) for AI context, per PRD.
- [ ] Character portraits/expressions upload and display in nodes and reader.
- [ ] Per-character and per-dialogue word-count/statistics view (VO budgeting).
- [ ] Node review status flags (draft/final/todo) with canvas indicators and a filter.
- [ ] Variable groups editing UI and default-namespace settings.
- [ ] Project settings tab on the dashboard (custom character fields, expression slots).

## Playtest & reader

- [ ] "Restart from this node" — start a playtest at the selected node with current-or-default variables.
- [ ] Playtest history export (transcript with rolls) for review threads.
- [ ] Reader view (`/play/:projectId/:dialogueId`) per PRD Phase 3 — the playtest panel's transcript rendering is the seed for it.
- [ ] Variable overrides during playtest (edit values in the watch panel).

## Infra

- [ ] URL routing (TanStack Router) so home/project/dialogue views and selected node are bookmarkable; the `$appView` store is a stopgap.
- [ ] Validation perf: debounce or scope `validateProject` for the toolbar badge on large projects.
- [ ] Stable line IDs surfaced in the UI + localization export (line keys → CSV/PO), per PRD.
