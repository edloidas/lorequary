import {atom} from 'nanostores';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vite-plus/test';

import {startAutosave} from './autosave';

describe('startAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces rapid changes into a single save of the latest value', () => {
    const $doc = atom<string | null>(null);
    const save = vi.fn();
    const stop = startAutosave($doc, save, 2000);

    $doc.set('v1');
    vi.advanceTimersByTime(500);
    $doc.set('v2');
    vi.advanceTimersByTime(1999);

    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('v2');

    stop();
  });

  it('ignores null values and stops cleanly', () => {
    const $doc = atom<string | null>(null);
    const save = vi.fn();
    const stop = startAutosave($doc, save, 2000);

    $doc.set(null);
    vi.advanceTimersByTime(3000);

    expect(save).not.toHaveBeenCalled();

    $doc.set('v1');
    stop();
    vi.advanceTimersByTime(3000);

    expect(save).not.toHaveBeenCalled();
  });
});
