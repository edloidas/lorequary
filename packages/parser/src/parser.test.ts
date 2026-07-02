import {describe, expect, it} from 'vite-plus/test';

import type {ConditionNode, EffectNode, Expr} from './ast';

import {parseCondition, parseEffect} from './parser';

const condition = (source: string): Expr => {
  const result = parseCondition(source);

  if (!result.ok) {
    expect.unreachable(`expected condition, got error: ${result.error.message}`);
  }

  return result.value.expression;
};

const effect = (source: string): EffectNode['assignment'] => {
  const result = parseEffect(source);

  if (!result.ok) {
    expect.unreachable(`expected effect, got error: ${result.error.message}`);
  }

  return result.value.assignment;
};

const conditionError = (source: string): string => {
  const result = parseCondition(source);

  if (result.ok) {
    expect.unreachable('expected an error');
  }

  return result.error.message;
};

const effectError = (source: string): string => {
  const result = parseEffect(source);

  if (result.ok) {
    expect.unreachable('expected an error');
  }

  return result.error.message;
};

describe('parseCondition', () => {
  it('wraps the expression in a Condition node', () => {
    const result = parseCondition('true');

    expect(result.ok).toBe(true);
    expect((result as {value: ConditionNode}).value.type).toBe('Condition');
  });

  describe('primaries', () => {
    it('parses literals', () => {
      expect(condition('42')).toStrictEqual({type: 'Literal', value: 42});
      expect(condition('3.5')).toStrictEqual({type: 'Literal', value: 3.5});
      expect(condition('"noble"')).toStrictEqual({type: 'Literal', value: 'noble'});
      expect(condition('true')).toStrictEqual({type: 'Literal', value: true});
      expect(condition('false')).toStrictEqual({type: 'Literal', value: false});
    });

    it('parses a bare path (shorthand for == true)', () => {
      expect(condition('quest.baron_alive')).toStrictEqual({type: 'Path', value: 'quest.baron_alive'});
    });

    it('parses a single-segment path', () => {
      expect(condition('alive')).toStrictEqual({type: 'Path', value: 'alive'});
    });

    it('parses deep paths', () => {
      expect(condition('hero.skills.rhetoric')).toStrictEqual({type: 'Path', value: 'hero.skills.rhetoric'});
    });
  });

  describe('function calls', () => {
    it('parses a zero-arg call', () => {
      expect(condition('seenCount()')).toStrictEqual({type: 'FunctionCall', name: 'seenCount', args: []});
    });

    it('parses calls with arguments', () => {
      expect(condition('random(1, 4)')).toStrictEqual({
        type: 'FunctionCall',
        name: 'random',
        args: [
          {type: 'Literal', value: 1},
          {type: 'Literal', value: 4},
        ],
      });
    });

    it('parses nested calls and expression arguments', () => {
      expect(condition('random(seenCount(), hero.luck + 1)')).toStrictEqual({
        type: 'FunctionCall',
        name: 'random',
        args: [
          {type: 'FunctionCall', name: 'seenCount', args: []},
          {
            type: 'BinaryExpr',
            op: '+',
            left: {type: 'Path', value: 'hero.luck'},
            right: {type: 'Literal', value: 1},
          },
        ],
      });
    });

    it('rejects a dotted name called as a function', () => {
      expect(conditionError('hero.func(1)')).toMatch(/unexpected token/i);
    });
  });

  describe('unary operators', () => {
    it('parses logical negation', () => {
      expect(condition('!quest.baron_alive')).toStrictEqual({
        type: 'UnaryExpr',
        op: '!',
        operand: {type: 'Path', value: 'quest.baron_alive'},
      });
    });

    it('parses numeric negation', () => {
      expect(condition('-5')).toStrictEqual({type: 'UnaryExpr', op: '-', operand: {type: 'Literal', value: 5}});
    });

    it('parses stacked unary operators', () => {
      expect(condition('!!a')).toStrictEqual({
        type: 'UnaryExpr',
        op: '!',
        operand: {type: 'UnaryExpr', op: '!', operand: {type: 'Path', value: 'a'}},
      });
    });
  });

  describe('precedence and associativity', () => {
    it('binds * tighter than +', () => {
      expect(condition('1 + 2 * 3')).toStrictEqual({
        type: 'BinaryExpr',
        op: '+',
        left: {type: 'Literal', value: 1},
        right: {
          type: 'BinaryExpr',
          op: '*',
          left: {type: 'Literal', value: 2},
          right: {type: 'Literal', value: 3},
        },
      });
    });

    it('binds comparison tighter than equality', () => {
      // a == b < c  →  a == (b < c)
      expect(condition('a == b < c')).toStrictEqual({
        type: 'BinaryExpr',
        op: '==',
        left: {type: 'Path', value: 'a'},
        right: {
          type: 'BinaryExpr',
          op: '<',
          left: {type: 'Path', value: 'b'},
          right: {type: 'Path', value: 'c'},
        },
      });
    });

    it('binds && tighter than ||', () => {
      expect(condition('a || b && c')).toStrictEqual({
        type: 'BinaryExpr',
        op: '||',
        left: {type: 'Path', value: 'a'},
        right: {
          type: 'BinaryExpr',
          op: '&&',
          left: {type: 'Path', value: 'b'},
          right: {type: 'Path', value: 'c'},
        },
      });
    });

    it('is left-associative for same-precedence operators', () => {
      expect(condition('10 - 4 - 3')).toStrictEqual({
        type: 'BinaryExpr',
        op: '-',
        left: {
          type: 'BinaryExpr',
          op: '-',
          left: {type: 'Literal', value: 10},
          right: {type: 'Literal', value: 4},
        },
        right: {type: 'Literal', value: 3},
      });
    });

    it('parses the spec example with mixed comparison and logic', () => {
      expect(condition('hero.money > 50 && npc.aurelia.attitude >= 5')).toStrictEqual({
        type: 'BinaryExpr',
        op: '&&',
        left: {
          type: 'BinaryExpr',
          op: '>',
          left: {type: 'Path', value: 'hero.money'},
          right: {type: 'Literal', value: 50},
        },
        right: {
          type: 'BinaryExpr',
          op: '>=',
          left: {type: 'Path', value: 'npc.aurelia.attitude'},
          right: {type: 'Literal', value: 5},
        },
      });
    });
  });

  describe('groups', () => {
    it('wraps parenthesized expressions in a Group node', () => {
      expect(condition('(a || b) && c')).toStrictEqual({
        type: 'BinaryExpr',
        op: '&&',
        left: {
          type: 'Group',
          expression: {
            type: 'BinaryExpr',
            op: '||',
            left: {type: 'Path', value: 'a'},
            right: {type: 'Path', value: 'b'},
          },
        },
        right: {type: 'Path', value: 'c'},
      });
    });

    it('errors on a missing closing parenthesis', () => {
      expect(conditionError('(a || b')).toMatch(/\)/);
    });
  });

  describe('errors', () => {
    it('errors on a missing operand', () => {
      expect(conditionError('hero.money >')).toMatch(/expected expression/i);
    });

    it('errors on adjacent comparison operators', () => {
      expect(conditionError('hero.money >> 5')).toMatch(/expected expression/i);
    });

    it('errors on trailing tokens', () => {
      expect(conditionError('a b')).toMatch(/unexpected token/i);
    });

    it('errors on an assignment inside a condition', () => {
      expect(conditionError('hero.money = 5')).toMatch(/unexpected token/i);
    });

    it('errors on empty input', () => {
      expect(conditionError('')).toMatch(/expected expression/i);
    });

    it('errors on a path with a trailing dot', () => {
      expect(conditionError('hero.')).toMatch(/identifier/i);
    });

    it('propagates lexer errors', () => {
      expect(conditionError('a # b')).toMatch(/#/);
    });

    it('carries position info', () => {
      const result = parseCondition('a &&');

      if (result.ok) {
        expect.unreachable('expected an error');
      }

      expect(result.error).toMatchObject({kind: 'parse', line: 1, column: 5});
    });
  });
});

describe('parseEffect', () => {
  it('parses every assignment operator', () => {
    for (const op of ['=', '+=', '-=', '*=', '/='] as const) {
      expect(effect(`hero.money ${op} 100`)).toStrictEqual({
        type: 'Assignment',
        path: {type: 'Path', value: 'hero.money'},
        op,
        expr: {type: 'Literal', value: 100},
      });
    }
  });

  it('parses an arithmetic right-hand side', () => {
    expect(effect('hero.money = hero.money * 2 + 1')).toStrictEqual({
      type: 'Assignment',
      path: {type: 'Path', value: 'hero.money'},
      op: '=',
      expr: {
        type: 'BinaryExpr',
        op: '+',
        left: {
          type: 'BinaryExpr',
          op: '*',
          left: {type: 'Path', value: 'hero.money'},
          right: {type: 'Literal', value: 2},
        },
        right: {type: 'Literal', value: 1},
      },
    });
  });

  it('parses a function call right-hand side', () => {
    expect(effect('hero.money /= random(1, 4)')).toStrictEqual({
      type: 'Assignment',
      path: {type: 'Path', value: 'hero.money'},
      op: '/=',
      expr: {
        type: 'FunctionCall',
        name: 'random',
        args: [
          {type: 'Literal', value: 1},
          {type: 'Literal', value: 4},
        ],
      },
    });
  });

  it('wraps the assignment in an Effect node', () => {
    const result = parseEffect('hero.xp = 0');

    expect(result.ok).toBe(true);
    expect((result as {value: EffectNode}).value.type).toBe('Effect');
  });

  describe('errors', () => {
    it('errors when the left side is not a path', () => {
      expect(effectError('5 = 3')).toMatch(/path/i);
    });

    it('errors when the assignment operator is missing', () => {
      expect(effectError('hero.money 100')).toMatch(/assignment/i);
    });

    it('errors on a condition passed as an effect', () => {
      expect(effectError('hero.money > 50')).toMatch(/assignment/i);
    });

    it('errors on trailing tokens after the expression', () => {
      expect(effectError('hero.money = 5 5')).toMatch(/unexpected token/i);
    });

    it('errors on empty input', () => {
      expect(effectError('')).toMatch(/path/i);
    });
  });
});
