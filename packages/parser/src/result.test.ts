import type {Result} from './result';

import {err, ok} from './result';

describe('Result', () => {
  it('ok wraps a value', () => {
    const result = ok(42);

    expect(result.ok).toBe(true);
    expect(result).toStrictEqual({ok: true, value: 42});
  });

  it('err wraps an error', () => {
    const result = err('something went wrong');

    expect(result.ok).toBe(false);
    expect(result).toStrictEqual({ok: false, error: 'something went wrong'});
  });

  it('narrows type via ok discriminator', () => {
    const result: Result<number, string> = ok(10);

    if (result.ok) {
      expect(result.value).toBe(10);
    } else {
      expect.unreachable('should be ok');
    }
  });

  it('narrows type via error discriminator', () => {
    const result: Result<number, string> = err('fail');

    if (!result.ok) {
      expect(result.error).toBe('fail');
    } else {
      expect.unreachable('should be err');
    }
  });
});
