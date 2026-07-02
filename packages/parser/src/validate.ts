import type {ASTNode, ConditionNode, EffectNode, Expr} from './ast';
import type {ValidationError} from './errors';
import type {FunctionSignatures, ValueType} from './functions';

import {BUILTIN_SIGNATURES} from './functions';

export type {ValidationError} from './errors';

export type VariableSchema = Record<string, {type: ValueType}>;

// 'unknown' marks subexpressions that already reported an error — checks involving them are skipped
// so one root cause does not cascade into a pile of follow-up errors.
type InferredType = ValueType | 'unknown';

const describeArity = (min: number, max: number): string => (min === max ? `${min}` : `${min}-${max}`);

class Validator {
  readonly errors: ValidationError[] = [];

  constructor(
    private readonly schema: VariableSchema,
    private readonly functions: FunctionSignatures,
  ) {}

  private report(node: ASTNode, message: string, path?: string): void {
    this.errors.push(
      path === undefined ? {kind: 'validation', message, node} : {kind: 'validation', message, path, node},
    );
  }

  infer(expr: Expr): InferredType {
    switch (expr.type) {
      case 'Literal':
        return typeof expr.value as ValueType;
      case 'Path': {
        const variable = this.schema[expr.value];

        if (variable === undefined) {
          this.report(expr, `Unknown variable \`${expr.value}\``, expr.value);
          return 'unknown';
        }

        return variable.type;
      }
      case 'Group':
        return this.infer(expr.expression);
      case 'FunctionCall':
        return this.inferCall(expr);
      case 'UnaryExpr': {
        const operand = this.infer(expr.operand);
        const required: ValueType = expr.op === '!' ? 'boolean' : 'number';

        if (operand !== 'unknown' && operand !== required) {
          this.report(expr, `Operator \`${expr.op}\` requires a ${required} operand, got ${operand}`);
          return 'unknown';
        }

        return required;
      }
      case 'BinaryExpr':
        return this.inferBinary(expr);
    }
  }

  private inferCall(expr: Expr & {type: 'FunctionCall'}): InferredType {
    const signature = this.functions[expr.name];

    if (signature === undefined) {
      this.report(expr, `Unknown function \`${expr.name}\``);

      for (const arg of expr.args) this.infer(arg);

      return 'unknown';
    }

    const {minArgs, maxArgs, argType, returns} = signature;

    if (expr.args.length < minArgs || expr.args.length > maxArgs) {
      this.report(
        expr,
        `Function \`${expr.name}\` expects ${describeArity(minArgs, maxArgs)} argument(s), got ${expr.args.length}`,
      );
    }

    for (const arg of expr.args) {
      const argInferred = this.infer(arg);

      if (argType !== undefined && argInferred !== 'unknown' && argInferred !== argType) {
        this.report(arg, `Function \`${expr.name}\` expects ${argType} arguments, got ${argInferred}`);
      }
    }

    return returns;
  }

  private inferBinary(expr: Expr & {type: 'BinaryExpr'}): InferredType {
    const left = this.infer(expr.left);
    const right = this.infer(expr.right);

    switch (expr.op) {
      case '&&':
      case '||': {
        this.requireBoth(expr, left, right, 'boolean');
        return 'boolean';
      }
      case '==':
      case '!=': {
        if (left !== 'unknown' && right !== 'unknown' && left !== right) {
          this.report(expr, `Cannot compare ${left} with ${right}`);
        }

        return 'boolean';
      }
      case '<':
      case '>':
      case '<=':
      case '>=': {
        this.requireBoth(expr, left, right, 'number');
        return 'boolean';
      }
      case '+':
      case '-':
      case '*':
      case '/': {
        this.requireBoth(expr, left, right, 'number');
        return 'number';
      }
    }
  }

  private requireBoth(expr: Expr, left: InferredType, right: InferredType, required: ValueType): void {
    const offending = [left, right].find(t => t !== 'unknown' && t !== required);

    if (offending !== undefined && expr.type === 'BinaryExpr') {
      this.report(expr, `Operator \`${expr.op}\` requires ${required} operands, got ${offending}`);
    }
  }

  validateCondition(node: ConditionNode): void {
    const inferred = this.infer(node.expression);

    if (inferred !== 'unknown' && inferred !== 'boolean') {
      this.report(node, `Condition must evaluate to a boolean, got ${inferred}`);
    }
  }

  validateEffect(node: EffectNode): void {
    const {path, op, expr} = node.assignment;
    const variable = this.schema[path.value];
    const target: InferredType = variable === undefined ? 'unknown' : variable.type;

    if (variable === undefined) {
      this.report(path, `Unknown variable \`${path.value}\``, path.value);
    }

    const value = this.infer(expr);

    if (op === '=') {
      if (target !== 'unknown' && value !== 'unknown' && target !== value) {
        this.report(node.assignment, `Cannot assign ${value} to ${target} variable \`${path.value}\``);
      }

      return;
    }

    if (target !== 'unknown' && target !== 'number') {
      this.report(node.assignment, `Compound assignment \`${op}\` requires a number variable, got ${target}`);
    }

    if (value !== 'unknown' && value !== 'number') {
      this.report(node.assignment, `Compound assignment \`${op}\` requires a number value, got ${value}`);
    }
  }
}

export const validate = (
  node: ConditionNode | EffectNode,
  schema: VariableSchema,
  functions?: FunctionSignatures,
): ValidationError[] => {
  const validator = new Validator(schema, {...BUILTIN_SIGNATURES, ...functions});

  if (node.type === 'Condition') {
    validator.validateCondition(node);
  } else {
    validator.validateEffect(node);
  }

  return validator.errors;
};
