import type {AssignOp, BinaryOp, ConditionNode, EffectNode, Expr, Path} from './ast';
import type {ParseError} from './errors';
import type {Result} from './result';
import type {Token, TokenType} from './tokens';

import {tokenize} from './lexer';
import {err, ok} from './result';

const ASSIGN_OPS: Partial<Record<TokenType, AssignOp>> = {
  Eq: '=',
  PlusEq: '+=',
  MinusEq: '-=',
  StarEq: '*=',
  SlashEq: '/=',
};

const EQUALITY_OPS: Partial<Record<TokenType, BinaryOp>> = {EqEq: '==', BangEq: '!='};
const COMPARISON_OPS: Partial<Record<TokenType, BinaryOp>> = {Lt: '<', Gt: '>', LtEq: '<=', GtEq: '>='};
const ADDITIVE_OPS: Partial<Record<TokenType, BinaryOp>> = {Plus: '+', Minus: '-'};
const MULTIPLICATIVE_OPS: Partial<Record<TokenType, BinaryOp>> = {Star: '*', Slash: '/'};

class ParseFailure extends Error {
  constructor(readonly error: ParseError) {
    super(error.message);
  }
}

// tokenize() always terminates the stream with an EOF token, so this fallback is unreachable;
// it only satisfies noUncheckedIndexedAccess without assertions.
const FALLBACK_EOF: Token = {type: 'EOF', value: '', offset: 0, line: 1, column: 1};

const failAt = (token: Token, message: string): never => {
  throw new ParseFailure({
    kind: 'parse',
    message,
    offset: token.offset,
    line: token.line,
    column: token.column,
  });
};

const describeToken = (token: Token): string => (token.type === 'EOF' ? 'end of input' : `\`${token.value}\``);

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.index] ?? FALLBACK_EOF;
  }

  private advance(): Token {
    const token = this.peek();
    if (token.type !== 'EOF') this.index += 1;
    return token;
  }

  private expect(type: TokenType, message: string): Token {
    const token = this.peek();
    if (token.type !== type) failAt(token, message);
    return this.advance();
  }

  expectEnd(): void {
    const token = this.peek();
    if (token.type !== 'EOF') failAt(token, `Unexpected token ${describeToken(token)}`);
  }

  // expression = logic_or
  expression(): Expr {
    return this.binary(() => this.binary(() => this.binary(() => this.comparison(), EQUALITY_OPS), {AmpAmp: '&&'}), {
      PipePipe: '||',
    });
  }

  private comparison(): Expr {
    return this.binary(
      () => this.binary(() => this.binary(() => this.unary(), MULTIPLICATIVE_OPS), ADDITIVE_OPS),
      COMPARISON_OPS,
    );
  }

  private binary(operand: () => Expr, ops: Partial<Record<TokenType, BinaryOp>>): Expr {
    let left = operand();
    let op = ops[this.peek().type];

    while (op !== undefined) {
      this.advance();
      const right = operand();
      left = {type: 'BinaryExpr', op, left, right};
      op = ops[this.peek().type];
    }

    return left;
  }

  private unary(): Expr {
    const token = this.peek();

    if (token.type === 'Bang' || token.type === 'Minus') {
      this.advance();
      return {type: 'UnaryExpr', op: token.type === 'Bang' ? '!' : '-', operand: this.unary()};
    }

    return this.call();
  }

  // call = IDENTIFIER "(" args ")" | primary — disambiguated by one-token lookahead
  private call(): Expr {
    const token = this.peek();

    if (token.type === 'Identifier' && this.tokens[this.index + 1]?.type === 'LParen') {
      this.advance();
      this.advance();

      const args: Expr[] = [];
      if (this.peek().type !== 'RParen') {
        args.push(this.expression());
        while (this.peek().type === 'Comma') {
          this.advance();
          args.push(this.expression());
        }
      }
      this.expect('RParen', 'Expected `)` after function arguments');

      return {type: 'FunctionCall', name: token.value, args};
    }

    return this.primary();
  }

  private primary(): Expr {
    const token = this.peek();

    switch (token.type) {
      case 'Number':
        this.advance();
        return {type: 'Literal', value: Number.parseFloat(token.value)};
      case 'String':
        this.advance();
        return {type: 'Literal', value: token.value};
      case 'True':
        this.advance();
        return {type: 'Literal', value: true};
      case 'False':
        this.advance();
        return {type: 'Literal', value: false};
      case 'Identifier':
        return this.path();
      case 'LParen': {
        this.advance();
        const expression = this.expression();
        this.expect('RParen', 'Expected `)` to close the group');
        return {type: 'Group', expression};
      }
      default:
        return failAt(token, `Expected expression, got ${describeToken(token)}`);
    }
  }

  path(): Path {
    const first = this.expect('Identifier', `Expected a path, got ${describeToken(this.peek())}`);
    const segments = [first.value];

    while (this.peek().type === 'Dot') {
      this.advance();
      const segment = this.expect('Identifier', 'Expected identifier after `.`');
      segments.push(segment.value);
    }

    return {type: 'Path', value: segments.join('.')};
  }

  assignOp(): AssignOp {
    const token = this.peek();
    const op = ASSIGN_OPS[token.type];

    if (op === undefined) {
      return failAt(token, `Expected an assignment operator (=, +=, -=, *=, /=), got ${describeToken(token)}`);
    }

    this.advance();
    return op;
  }
}

const run = <T>(source: string, parse: (parser: Parser) => T): Result<T, ParseError> => {
  const tokens = tokenize(source);
  if (!tokens.ok) return tokens;

  try {
    return ok(parse(new Parser(tokens.value)));
  } catch (error) {
    if (error instanceof ParseFailure) return err(error.error);
    throw error;
  }
};

export const parseCondition = (source: string): Result<ConditionNode, ParseError> =>
  run<ConditionNode>(source, parser => {
    const expression = parser.expression();
    parser.expectEnd();
    return {type: 'Condition', expression};
  });

export const parseEffect = (source: string): Result<EffectNode, ParseError> =>
  run<EffectNode>(source, parser => {
    const path = parser.path();
    const op = parser.assignOp();
    const expr = parser.expression();
    parser.expectEnd();
    return {type: 'Effect', assignment: {type: 'Assignment', path, op, expr}};
  });
