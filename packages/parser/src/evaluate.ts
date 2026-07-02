import type {ASTNode, ConditionNode, EffectNode, Expr} from './ast';
import type {EvalError} from './errors';
import type {FunctionHandler} from './functions';
import type {Result} from './result';

import {BUILTIN_HANDLERS} from './functions';
import {err, ok} from './result';

export type Resolver = (path: string) => unknown;

export type Context = {
  resolve: Resolver;
  seenCount: number;
  functions?: Record<string, FunctionHandler>;
};

export type EffectResult = {
  path: string;
  value: unknown;
};

class EvalFailure extends Error {
  constructor(readonly error: EvalError) {
    super(error.message);
  }
}

const failAt = (node: ASTNode, message: string): never => {
  throw new EvalFailure({kind: 'eval', message, node});
};

const resolveByDotPath = (state: Record<string, unknown>): Resolver => {
  return path => {
    let current: unknown = state;

    for (const segment of path.split('.')) {
      if (typeof current !== 'object' || current === null) return undefined;
      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  };
};

const isContext = (context: Context | Record<string, unknown>): context is Context =>
  typeof (context as Context).resolve === 'function';

const normalize = (context: Context | Record<string, unknown>): Context =>
  isContext(context) ? context : {resolve: resolveByDotPath(context), seenCount: 0};

class Evaluator {
  private readonly functions: Record<string, FunctionHandler>;

  constructor(private readonly context: Context) {
    this.functions = {
      ...BUILTIN_HANDLERS,
      seenCount: () => context.seenCount,
      ...context.functions,
    };
  }

  resolvePath(node: ASTNode, path: string): unknown {
    const value = this.context.resolve(path);

    if (value === undefined) {
      failAt(node, `Variable \`${path}\` has no value`);
    }

    return value;
  }

  evaluate(expr: Expr): unknown {
    switch (expr.type) {
      case 'Literal':
        return expr.value;
      case 'Path':
        return this.resolvePath(expr, expr.value);
      case 'Group':
        return this.evaluate(expr.expression);
      case 'FunctionCall': {
        const handler = this.functions[expr.name];

        if (handler === undefined) {
          return failAt(expr, `Unknown function \`${expr.name}\``);
        }

        const args = expr.args.map(arg => this.evaluate(arg));

        try {
          return handler(args);
        } catch (error) {
          return failAt(expr, error instanceof Error ? error.message : String(error));
        }
      }
      case 'UnaryExpr': {
        const operand = this.evaluate(expr.operand);

        if (expr.op === '!') {
          if (typeof operand !== 'boolean') {
            return failAt(expr, `Operator \`!\` requires a boolean operand, got ${typeof operand}`);
          }

          return !operand;
        }

        if (typeof operand !== 'number') {
          return failAt(expr, `Operator \`-\` requires a number operand, got ${typeof operand}`);
        }

        return -operand;
      }
      case 'BinaryExpr':
        return this.evaluateBinary(expr);
    }
  }

  private evaluateBinary(expr: Expr & {type: 'BinaryExpr'}): unknown {
    // Logical operators short-circuit — the right side must stay unevaluated.
    if (expr.op === '&&' || expr.op === '||') {
      const left = this.requireBoolean(expr, this.evaluate(expr.left));

      if (expr.op === '&&' && !left) return false;
      if (expr.op === '||' && left) return true;

      return this.requireBoolean(expr, this.evaluate(expr.right));
    }

    const left = this.evaluate(expr.left);
    const right = this.evaluate(expr.right);

    switch (expr.op) {
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      case '<':
        return this.requireNumber(expr, left) < this.requireNumber(expr, right);
      case '<=':
        return this.requireNumber(expr, left) <= this.requireNumber(expr, right);
      case '>':
        return this.requireNumber(expr, left) > this.requireNumber(expr, right);
      case '>=':
        return this.requireNumber(expr, left) >= this.requireNumber(expr, right);
      case '+':
        return this.requireNumber(expr, left) + this.requireNumber(expr, right);
      case '-':
        return this.requireNumber(expr, left) - this.requireNumber(expr, right);
      case '*':
        return this.requireNumber(expr, left) * this.requireNumber(expr, right);
      case '/': {
        const divisor = this.requireNumber(expr, right);

        if (divisor === 0) {
          failAt(expr, 'Division by zero');
        }

        return this.requireNumber(expr, left) / divisor;
      }
    }
  }

  requireNumber(node: ASTNode, value: unknown): number {
    if (typeof value !== 'number') {
      return failAt(node, `Expected a number operand, got ${typeof value}`);
    }

    return value;
  }

  requireBoolean(node: ASTNode, value: unknown): boolean {
    if (typeof value !== 'boolean') {
      return failAt(node, `Expected a boolean operand, got ${typeof value}`);
    }

    return value;
  }
}

const run = <T>(evaluate: () => T): Result<T, EvalError> => {
  try {
    return ok(evaluate());
  } catch (error) {
    if (error instanceof EvalFailure) return err(error.error);
    throw error;
  }
};

export const evaluateCondition = (
  node: ConditionNode,
  context: Context | Record<string, unknown>,
): Result<boolean, EvalError> =>
  run(() => {
    const evaluator = new Evaluator(normalize(context));
    const value = evaluator.evaluate(node.expression);

    if (typeof value !== 'boolean') {
      return failAt(node, `Condition must evaluate to a boolean, got ${typeof value}`);
    }

    return value;
  });

export const evaluateEffect = (
  node: EffectNode,
  context: Context | Record<string, unknown>,
): Result<EffectResult, EvalError> =>
  run(() => {
    const evaluator = new Evaluator(normalize(context));
    const {path, op, expr} = node.assignment;
    const value = evaluator.evaluate(expr);

    if (op === '=') {
      return {path: path.value, value};
    }

    const current = evaluator.requireNumber(path, evaluator.resolvePath(path, path.value));
    const operand = evaluator.requireNumber(node.assignment, value);

    switch (op) {
      case '+=':
        return {path: path.value, value: current + operand};
      case '-=':
        return {path: path.value, value: current - operand};
      case '*=':
        return {path: path.value, value: current * operand};
      case '/=': {
        if (operand === 0) {
          failAt(node.assignment, 'Division by zero');
        }

        return {path: path.value, value: current / operand};
      }
    }
  });
