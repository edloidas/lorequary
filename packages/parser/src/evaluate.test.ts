import {describe, expect, it} from 'vite-plus/test';

import type {ConditionNode, EffectNode} from './ast';
import type {Context, EffectResult} from './evaluate';

import {evaluateCondition, evaluateEffect} from './evaluate';
import {parseCondition, parseEffect} from './parser';

const cond = (source: string): ConditionNode => {
  const result = parseCondition(source);

  if (!result.ok) {
    expect.unreachable(`parse failed: ${result.error.message}`);
  }

  return result.value;
};

const eff = (source: string): EffectNode => {
  const result = parseEffect(source);

  if (!result.ok) {
    expect.unreachable(`parse failed: ${result.error.message}`);
  }

  return result.value;
};

const evalCond = (source: string, context: Context | Record<string, unknown>): boolean => {
  const result = evaluateCondition(cond(source), context);

  if (!result.ok) {
    expect.unreachable(`eval failed: ${result.error.message}`);
  }

  return result.value;
};

const evalEff = (source: string, context: Context | Record<string, unknown>): EffectResult => {
  const result = evaluateEffect(eff(source), context);

  if (!result.ok) {
    expect.unreachable(`eval failed: ${result.error.message}`);
  }

  return result.value;
};

const condError = (source: string, context: Context | Record<string, unknown>): string => {
  const result = evaluateCondition(cond(source), context);

  if (result.ok) {
    expect.unreachable('expected an eval error');
  }

  expect(result.error.kind).toBe('eval');
  expect(result.error.node).toBeDefined();

  return result.error.message;
};

const STATE = {
  hero: {money: 100, origin: 'noble', skills: {rhetoric: 4}},
  quest: {baron_alive: true},
};

describe('evaluateCondition', () => {
  describe('with a plain state record', () => {
    it('resolves nested paths via the default resolver', () => {
      expect(evalCond('hero.money > 50', STATE)).toBe(true);
      expect(evalCond('hero.money > 500', STATE)).toBe(false);
    });

    it('supports the bare path boolean shorthand', () => {
      expect(evalCond('quest.baron_alive', STATE)).toBe(true);
      expect(evalCond('!quest.baron_alive', STATE)).toBe(false);
    });

    it('compares strings with strict equality', () => {
      expect(evalCond('hero.origin == "noble"', STATE)).toBe(true);
      expect(evalCond('hero.origin != "peasant"', STATE)).toBe(true);
    });

    it('evaluates arithmetic and grouping', () => {
      expect(evalCond('(hero.money + 50) * 2 == 300', STATE)).toBe(true);
      expect(evalCond('hero.money / 4 - 5 == 20', STATE)).toBe(true);
      expect(evalCond('-hero.money < 0', STATE)).toBe(true);
    });

    it('defaults seenCount to 0', () => {
      expect(evalCond('seenCount() == 0', STATE)).toBe(true);
    });
  });

  describe('short-circuit evaluation', () => {
    it('skips the right side of || when the left is true', () => {
      expect(evalCond('true || hero.money / 0 > 1', STATE)).toBe(true);
    });

    it('skips the right side of && when the left is false', () => {
      expect(evalCond('false && hero.money / 0 > 1', STATE)).toBe(false);
    });
  });

  describe('with a full Context', () => {
    const context: Context = {
      resolve: path => (path === 'npc.attitude' ? 6 : undefined),
      seenCount: 3,
    };

    it('uses the provided resolver', () => {
      expect(evalCond('npc.attitude > 5', context)).toBe(true);
    });

    it('reads seenCount from the context', () => {
      expect(evalCond('seenCount() * 2 == 6', context)).toBe(true);
    });

    it('dispatches custom functions', () => {
      expect(evalCond('luck() == 7', {...context, functions: {luck: () => 7}})).toBe(true);
    });

    it('lets custom handlers override built-ins', () => {
      expect(evalCond('random(1, 6) == 4', {...context, functions: {random: () => 4}})).toBe(true);
    });
  });

  describe('errors', () => {
    it('errors when a variable has no value', () => {
      expect(condError('hero.mana > 5', STATE)).toMatch(/`hero\.mana` has no value/);
    });

    it('errors on division by zero', () => {
      expect(condError('hero.money / 0 > 1', STATE)).toMatch(/division by zero/i);
    });

    it('errors when the condition is not boolean', () => {
      expect(condError('hero.money + 1', STATE)).toMatch(/boolean/i);
    });

    it('errors on invalid random bounds', () => {
      expect(condError('random(5, 1) > 0', STATE)).toMatch(/min must be less than max/);
    });

    it('errors on an unknown function', () => {
      expect(condError('ghost() > 0', STATE)).toMatch(/unknown function/i);
    });

    it('errors on arithmetic with non-numbers', () => {
      expect(condError('hero.origin + 1 > 0', STATE)).toMatch(/number/i);
    });

    it('errors on ordering comparison with non-numbers', () => {
      expect(condError('hero.origin > 5', STATE)).toMatch(/number/i);
    });

    it('errors on logical operators with non-booleans', () => {
      expect(condError('hero.money && true', STATE)).toMatch(/boolean/i);
    });
  });
});

describe('evaluateEffect', () => {
  it('computes a plain assignment', () => {
    expect(evalEff('hero.money = 42', STATE)).toStrictEqual({path: 'hero.money', value: 42});
  });

  it('computes compound assignments from the current value', () => {
    expect(evalEff('hero.money += 100', STATE)).toStrictEqual({path: 'hero.money', value: 200});
    expect(evalEff('hero.money -= 30', STATE)).toStrictEqual({path: 'hero.money', value: 70});
    expect(evalEff('hero.money *= 2', STATE)).toStrictEqual({path: 'hero.money', value: 200});
    expect(evalEff('hero.money /= 4', STATE)).toStrictEqual({path: 'hero.money', value: 25});
  });

  it('evaluates expression right-hand sides', () => {
    expect(evalEff('hero.money = hero.skills.rhetoric * 10 + 5', STATE)).toStrictEqual({
      path: 'hero.money',
      value: 45,
    });
  });

  it('keeps random results within bounds', () => {
    const {value} = evalEff('hero.money = random(1, 4)', STATE);

    expect(typeof value).toBe('number');
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(4);
  });

  it('does not mutate the input state', () => {
    evalEff('hero.money += 100', STATE);

    expect(STATE.hero.money).toBe(100);
  });

  describe('errors', () => {
    it('errors when a compound target has no value', () => {
      const result = evaluateEffect(eff('hero.mana += 1'), STATE);

      if (result.ok) {
        expect.unreachable('expected an eval error');
      }

      expect(result.error.message).toMatch(/`hero\.mana` has no value/);
    });

    it('errors on /= 0', () => {
      const result = evaluateEffect(eff('hero.money /= 0'), STATE);

      if (result.ok) {
        expect.unreachable('expected an eval error');
      }

      expect(result.error.message).toMatch(/division by zero/i);
    });

    it('errors when a compound target is not a number', () => {
      const result = evaluateEffect(eff('hero.origin += 1'), STATE);

      if (result.ok) {
        expect.unreachable('expected an eval error');
      }

      expect(result.error.message).toMatch(/number/i);
    });
  });
});
