# @lorequary/parser

Expression language parser, validator, and evaluator for game dialogue systems. Zero dependencies, runtime-neutral, ESM.

Built for [Lorequary](https://github.com/edloidas/lorequary), a visual editor for branching game dialogs — but usable in any game runtime that stores conditions and effects as expression strings.

## The language

Two strict modes, no control flow:

**Conditions** — pure boolean checks:

```
hero.money > 50
hero.skills.rhetoric >= 4 || hero.skills.empathy >= 3
!quest.baron_alive
npc.aurelia.attitude > seenCount() * 2
```

**Effects** — single assignments:

```
hero.money += 100
hero.xp = 0
hero.money /= random(1, 4)
```

Paths are opaque dot-separated identifiers. Literals: numbers, double-quoted strings, `true`/`false`. Operators: `== != > < >= <= && || ! + - * /` and assignment `= += -= *= /=`.

## Usage

All fallible operations return `Result<T, E>` — errors are data, not exceptions.

```ts
import {parseCondition, parseEffect, validate, evaluateCondition, evaluateEffect} from '@lorequary/parser';

// Parse
const condition = parseCondition('hero.money > 50');
if (!condition.ok) {
  console.error(condition.error.message, condition.error.line, condition.error.column);
}

// Validate against a variable schema (for editors: run on every keystroke)
const errors = validate(condition.value, {
  'hero.money': {type: 'number'},
});
// [] means valid; multiple errors reported in one pass

// Evaluate against plain state…
const result = evaluateCondition(condition.value, {hero: {money: 100}});
// {ok: true, value: true}

// …or a full context with a custom resolver
const effect = parseEffect('hero.money += random(10, 50)');
const outcome = evaluateEffect(effect.value, {
  resolve: path => gameState.get(path),
  seenCount: visitTracker.count(currentNodeId),
});
// {ok: true, value: {path: 'hero.money', value: 137}} — no mutation; applying it is up to you
```

## Custom functions

`random` and `seenCount` ship built in. Register your own:

```ts
import {validate, evaluateCondition} from '@lorequary/parser';

validate(node, schema, {luck: {minArgs: 0, maxArgs: 0, returns: 'number'}});

evaluateCondition(node, {
  resolve,
  seenCount: 0,
  functions: {luck: () => player.luck},
});
```

## License

MIT
