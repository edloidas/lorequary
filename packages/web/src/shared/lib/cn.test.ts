import {cn} from './cn';

describe('cn', () => {
  it('returns a string', () => {
    expect(cn('foo')).toBe('foo');
  });

  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    const condition = false;
    expect(cn('foo', condition && 'bar', 'baz')).toBe('foo baz');
  });

  it('deduplicates tailwind conflicts', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
