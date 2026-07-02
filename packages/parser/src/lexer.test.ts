import {describe, expect, it} from 'vite-plus/test';

import type {Token, TokenType} from './tokens';

import {tokenize} from './lexer';

const types = (tokens: Token[]): TokenType[] => tokens.map(t => t.type);

const expectTokens = (source: string): Token[] => {
  const result = tokenize(source);

  if (!result.ok) {
    expect.unreachable(`expected tokens, got error: ${result.error.message}`);
  }

  return result.value;
};

const expectError = (source: string): string => {
  const result = tokenize(source);

  if (result.ok) {
    expect.unreachable('expected an error, got tokens');
  }

  expect(result.error.kind).toBe('parse');

  return result.error.message;
};

describe('tokenize', () => {
  describe('numbers', () => {
    it('tokenizes an integer', () => {
      const tokens = expectTokens('42');

      expect(tokens[0]).toMatchObject({type: 'Number', value: '42'});
      expect(types(tokens)).toStrictEqual(['Number', 'EOF']);
    });

    it('tokenizes a float', () => {
      const tokens = expectTokens('3.5');

      expect(tokens[0]).toMatchObject({type: 'Number', value: '3.5'});
    });

    it('does not consume a trailing dot as part of a number', () => {
      const tokens = expectTokens('1.max');

      expect(types(tokens)).toStrictEqual(['Number', 'Dot', 'Identifier', 'EOF']);
      expect(tokens[0]?.value).toBe('1');
    });
  });

  describe('strings', () => {
    it('tokenizes a double-quoted string', () => {
      const tokens = expectTokens('"noble"');

      expect(tokens[0]).toMatchObject({type: 'String', value: 'noble'});
    });

    it('supports escaped quotes and backslashes', () => {
      const tokens = expectTokens('"say \\"hi\\" \\\\"');

      expect(tokens[0]).toMatchObject({type: 'String', value: 'say "hi" \\'});
    });

    it('errors on an unterminated string', () => {
      expect(expectError('"unterminated')).toMatch(/unterminated string/i);
    });
  });

  describe('identifiers and keywords', () => {
    it('tokenizes identifiers with underscores and digits', () => {
      const tokens = expectTokens('_baron2_alive');

      expect(tokens[0]).toMatchObject({type: 'Identifier', value: '_baron2_alive'});
    });

    it('tokenizes true and false as keywords', () => {
      const tokens = expectTokens('true false');

      expect(types(tokens)).toStrictEqual(['True', 'False', 'EOF']);
    });

    it('treats keyword prefixes as plain identifiers', () => {
      const tokens = expectTokens('truely');

      expect(tokens[0]).toMatchObject({type: 'Identifier', value: 'truely'});
    });
  });

  describe('operators and punctuation', () => {
    it('tokenizes every operator', () => {
      const tokens = expectTokens('+ - * / == != < <= > >= && || ! = += -= *= /= . , ( )');

      expect(types(tokens)).toStrictEqual([
        'Plus',
        'Minus',
        'Star',
        'Slash',
        'EqEq',
        'BangEq',
        'Lt',
        'LtEq',
        'Gt',
        'GtEq',
        'AmpAmp',
        'PipePipe',
        'Bang',
        'Eq',
        'PlusEq',
        'MinusEq',
        'StarEq',
        'SlashEq',
        'Dot',
        'Comma',
        'LParen',
        'RParen',
        'EOF',
      ]);
    });

    it('disambiguates adjacent operators without spaces', () => {
      const tokens = expectTokens('a<=b==!c');

      expect(types(tokens)).toStrictEqual(['Identifier', 'LtEq', 'Identifier', 'EqEq', 'Bang', 'Identifier', 'EOF']);
    });

    it('errors on a lone ampersand', () => {
      expect(expectError('a & b')).toMatch(/&/);
    });

    it('errors on a lone pipe', () => {
      expect(expectError('a | b')).toMatch(/\|/);
    });

    it('errors on an unexpected character', () => {
      expect(expectError('hero.money > 50 #')).toMatch(/#/);
    });
  });

  describe('positions', () => {
    it('tracks offset, line, and column', () => {
      const tokens = expectTokens('a >\n bb');

      expect(tokens[0]).toMatchObject({offset: 0, line: 1, column: 1});
      expect(tokens[1]).toMatchObject({offset: 2, line: 1, column: 3});
      expect(tokens[2]).toMatchObject({offset: 5, line: 2, column: 2});
    });

    it('reports the error position', () => {
      const result = tokenize('ab ^');

      if (result.ok) {
        expect.unreachable('expected an error');
      }

      expect(result.error).toMatchObject({offset: 3, line: 1, column: 4});
    });
  });

  describe('full expressions', () => {
    it('tokenizes a realistic condition', () => {
      const tokens = expectTokens('hero.skills.rhetoric >= 4 || npc.aurelia.attitude > seenCount() * 2');

      expect(types(tokens)).toStrictEqual([
        'Identifier',
        'Dot',
        'Identifier',
        'Dot',
        'Identifier',
        'GtEq',
        'Number',
        'PipePipe',
        'Identifier',
        'Dot',
        'Identifier',
        'Dot',
        'Identifier',
        'Gt',
        'Identifier',
        'LParen',
        'RParen',
        'Star',
        'Number',
        'EOF',
      ]);
    });

    it('tokenizes an empty source to a single EOF', () => {
      const tokens = expectTokens('   ');

      expect(types(tokens)).toStrictEqual(['EOF']);
    });
  });
});
