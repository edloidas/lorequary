# Lorequary

Visual editor for branching game dialogs, built for narrative RPGs with skill checks and internal voices.

Author dialogue as a node graph, wire conditions and effects as expression strings, and step through the result in a built-in playtest runner. It runs entirely in the browser — projects live in IndexedDB, and export to a `.lorequary` file or to a runtime JSON IR your game can load.

> [!NOTE]
> Early prototype — the schema and the UI are still moving. See [docs/prd.md](docs/prd.md) for where it is going.

## Getting started

Node 26+ and pnpm 12+.

```bash
pnpm install
pnpm dev
```

`pnpm test` runs the suites, `pnpm check:fix` formats and lints.

## Packages

- [`@lorequary/core`](packages/core) — schema, serialization, validation, graph traversal
- [`@lorequary/parser`](packages/parser) — expression language, published to npm
- [`@lorequary/web`](packages/web) — the editor app

## Docs

- [prd.md](docs/prd.md) — product spec: users, concepts, roadmap
- [prototype.md](docs/prototype.md) — scope and design decisions for the current prototype
- [dialogue-graph.md](docs/dialogue-graph.md) — node kinds and graph rules
- [parser.md](docs/parser.md) — expression language design

## License

MIT
