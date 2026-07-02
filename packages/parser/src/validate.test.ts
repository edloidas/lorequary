import {describe, expect, it} from 'vite-plus/test';

import type {ConditionNode, EffectNode} from './ast';
import type {ValidationError, VariableSchema} from './validate';

import {parseCondition, parseEffect} from './parser';
import {validate} from './validate';

const SCHEMA: VariableSchema = {
  'hero.money': {type: 'number'},
  'hero.origin': {type: 'string'},
  'quest.baron_alive': {type: 'boolean'},
  'npc.aurelia.attitude': {type: 'number'},
};

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

const messages = (errors: ValidationError[]): string[] => errors.map(e => e.message);

describe('validate', () => {
  describe('valid inputs', () => {
    it('accepts a valid comparison condition', () => {
      expect(validate(cond('hero.money > 50'), SCHEMA)).toStrictEqual([]);
    });

    it('accepts a bare boolean path', () => {
      expect(validate(cond('quest.baron_alive'), SCHEMA)).toStrictEqual([]);
    });

    it('accepts negated boolean paths', () => {
      expect(validate(cond('!quest.baron_alive'), SCHEMA)).toStrictEqual([]);
    });

    it('accepts logical composition with grouping', () => {
      expect(
        validate(cond('(hero.origin == "noble" && hero.money >= 1000) || quest.baron_alive'), SCHEMA),
      ).toStrictEqual([]);
    });

    it('accepts built-in function calls', () => {
      expect(validate(cond('npc.aurelia.attitude > seenCount() * 2'), SCHEMA)).toStrictEqual([]);
      expect(validate(cond('hero.money > random(1, 6)'), SCHEMA)).toStrictEqual([]);
    });

    it('accepts a valid effect', () => {
      expect(validate(eff('hero.money += 100'), SCHEMA)).toStrictEqual([]);
    });

    it('accepts a string assignment with =', () => {
      expect(validate(eff('hero.origin = "noble"'), SCHEMA)).toStrictEqual([]);
    });
  });

  describe('unknown references', () => {
    it('reports an unknown variable with its path', () => {
      const errors = validate(cond('hero.moneyyy > 50'), SCHEMA);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({kind: 'validation', path: 'hero.moneyyy'});
      expect(errors[0]?.message).toMatch(/unknown variable/i);
    });

    it('reports an unknown function', () => {
      const errors = validate(cond('unknown_func(1) > 0'), SCHEMA);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toMatch(/unknown function/i);
    });

    it('reports multiple errors in one pass', () => {
      const errors = validate(cond('a > 1 && b < 2'), SCHEMA);

      expect(errors).toHaveLength(2);
      expect(errors.map(e => e.path)).toStrictEqual(['a', 'b']);
    });
  });

  describe('type errors', () => {
    it('rejects comparing number with string', () => {
      const errors = validate(cond('hero.money == "noble"'), SCHEMA);

      expect(messages(errors)[0]).toMatch(/cannot compare number with string/i);
    });

    it('rejects ordering comparison on non-numbers', () => {
      const errors = validate(cond('hero.origin > 5'), SCHEMA);

      expect(messages(errors)[0]).toMatch(/number/i);
    });

    it('rejects arithmetic on non-numbers', () => {
      const errors = validate(cond('hero.origin + 1 > 2'), SCHEMA);

      expect(messages(errors)[0]).toMatch(/number/i);
    });

    it('rejects logical operators on non-booleans', () => {
      const errors = validate(cond('hero.money && quest.baron_alive'), SCHEMA);

      expect(messages(errors)[0]).toMatch(/boolean/i);
    });

    it('rejects ! on non-booleans', () => {
      const errors = validate(cond('!hero.money'), SCHEMA);

      expect(messages(errors)[0]).toMatch(/boolean/i);
    });

    it('rejects a non-boolean condition result', () => {
      const errors = validate(cond('hero.money + 1'), SCHEMA);

      expect(messages(errors)[0]).toMatch(/condition must .*boolean/i);
    });

    it('does not cascade errors from an already-invalid subexpression', () => {
      const errors = validate(cond('unknown.var > 5'), SCHEMA);

      expect(errors).toHaveLength(1);
    });
  });

  describe('function arity', () => {
    it('rejects too many arguments', () => {
      const errors = validate(cond('hero.money > random(1, 2, 3)'), SCHEMA);

      expect(messages(errors)[0]).toMatch(/argument/i);
    });

    it('rejects too few arguments', () => {
      const errors = validate(cond('hero.money > random()'), SCHEMA);

      expect(messages(errors)[0]).toMatch(/argument/i);
    });

    it('rejects non-number arguments to random', () => {
      const errors = validate(cond('hero.money > random("a")'), SCHEMA);

      expect(messages(errors)[0]).toMatch(/number/i);
    });

    it('accepts custom functions through an extended registry', () => {
      const errors = validate(cond('hero.money > luck()'), SCHEMA, {
        luck: {minArgs: 0, maxArgs: 0, returns: 'number'},
      });

      expect(errors).toStrictEqual([]);
    });
  });

  describe('effects', () => {
    it('reports an unknown assignment target', () => {
      const errors = validate(eff('hero.gold = 5'), SCHEMA);

      expect(errors[0]).toMatchObject({path: 'hero.gold'});
    });

    it('rejects compound assignment on non-number variables', () => {
      const errors = validate(eff('hero.origin += "x"'), SCHEMA);

      expect(messages(errors)[0]).toMatch(/number/i);
    });

    it('rejects assigning a mismatched type', () => {
      const errors = validate(eff('hero.money = "rich"'), SCHEMA);

      expect(messages(errors)[0]).toMatch(/number/i);
    });

    it('rejects a boolean expression assigned to a number', () => {
      const errors = validate(eff('hero.money = quest.baron_alive'), SCHEMA);

      expect(messages(errors)[0]).toMatch(/number/i);
    });
  });
});
