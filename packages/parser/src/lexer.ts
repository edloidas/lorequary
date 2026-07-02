import type {ParseError} from './errors';
import type {Result} from './result';
import type {Token, TokenType} from './tokens';

import {err, ok} from './result';

const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';
const isIdentStart = (ch: string): boolean => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
const isIdentPart = (ch: string): boolean => isIdentStart(ch) || isDigit(ch);

const KEYWORDS: Record<string, TokenType> = {
  true: 'True',
  false: 'False',
};

// Two-char operators first — longest match wins.
const TWO_CHAR: Record<string, TokenType> = {
  '==': 'EqEq',
  '!=': 'BangEq',
  '<=': 'LtEq',
  '>=': 'GtEq',
  '+=': 'PlusEq',
  '-=': 'MinusEq',
  '*=': 'StarEq',
  '/=': 'SlashEq',
  '&&': 'AmpAmp',
  '||': 'PipePipe',
};

const ONE_CHAR: Record<string, TokenType> = {
  '+': 'Plus',
  '-': 'Minus',
  '*': 'Star',
  '/': 'Slash',
  '=': 'Eq',
  '<': 'Lt',
  '>': 'Gt',
  '!': 'Bang',
  '.': 'Dot',
  ',': 'Comma',
  '(': 'LParen',
  ')': 'RParen',
};

export const tokenize = (source: string): Result<Token[], ParseError> => {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let column = 1;

  const fail = (message: string, offset = pos, errLine = line, errColumn = column): Result<Token[], ParseError> =>
    err({kind: 'parse', message, offset, line: errLine, column: errColumn});

  const push = (type: TokenType, value: string, offset: number, tokLine: number, tokColumn: number): void => {
    tokens.push({type, value, offset, line: tokLine, column: tokColumn});
  };

  const advance = (count: number): void => {
    pos += count;
    column += count;
  };

  while (pos < source.length) {
    const ch = source.charAt(pos);

    if (ch === '\n') {
      pos += 1;
      line += 1;
      column = 1;
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      advance(1);
      continue;
    }

    const start = pos;
    const startLine = line;
    const startColumn = column;

    if (isDigit(ch)) {
      let end = pos + 1;
      while (end < source.length && isDigit(source.charAt(end))) end += 1;
      if (source.charAt(end) === '.' && isDigit(source.charAt(end + 1))) {
        end += 2;
        while (end < source.length && isDigit(source.charAt(end))) end += 1;
      }
      push('Number', source.slice(start, end), start, startLine, startColumn);
      advance(end - start);
      continue;
    }

    if (isIdentStart(ch)) {
      let end = pos + 1;
      while (end < source.length && isIdentPart(source.charAt(end))) end += 1;
      const value = source.slice(start, end);
      push(KEYWORDS[value] ?? 'Identifier', value, start, startLine, startColumn);
      advance(end - start);
      continue;
    }

    if (ch === '"') {
      let end = pos + 1;
      let value = '';
      while (end < source.length && source.charAt(end) !== '"') {
        if (source.charAt(end) === '\\' && end + 1 < source.length) {
          value += source.charAt(end + 1);
          end += 2;
        } else if (source.charAt(end) === '\n') {
          return fail('Unterminated string literal', start, startLine, startColumn);
        } else {
          value += source.charAt(end);
          end += 1;
        }
      }
      if (end >= source.length) {
        return fail('Unterminated string literal', start, startLine, startColumn);
      }
      push('String', value, start, startLine, startColumn);
      advance(end + 1 - start);
      continue;
    }

    const pair = source.slice(pos, pos + 2);
    const twoCharType = TWO_CHAR[pair];
    if (twoCharType !== undefined) {
      push(twoCharType, pair, start, startLine, startColumn);
      advance(2);
      continue;
    }

    if (ch === '&' || ch === '|') {
      return fail(`Unexpected character \`${ch}\` — did you mean \`${ch}${ch}\`?`);
    }

    const oneCharType = ONE_CHAR[ch];
    if (oneCharType !== undefined) {
      push(oneCharType, ch, start, startLine, startColumn);
      advance(1);
      continue;
    }

    return fail(`Unexpected character \`${ch}\``);
  }

  tokens.push({type: 'EOF', value: '', offset: pos, line, column});

  return ok(tokens);
};
