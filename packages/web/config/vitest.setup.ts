import '@testing-library/jest-dom/vitest';
import {vi} from 'vite-plus/test';

//
// * Polyfills
//

// Node 22+ provides a native localStorage that conflicts with jsdom's.
// Replace it with a simple in-memory implementation if getItem is missing.
if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      get length() {
        return store.size;
      },
      key: (index: number) => [...store.keys()][index] ?? null,
    },
    writable: true,
    configurable: true,
  });
}

/* oxlint-disable @typescript-eslint/no-unnecessary-condition */
globalThis.createImageBitmap ??= () => Promise.resolve({close: () => void 0, height: 0, width: 0});
/* oxlint-enable @typescript-eslint/no-unnecessary-condition */

if (!('decode' in HTMLImageElement.prototype)) {
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: () => Promise.resolve(),
  });
}

//
// * Mocks
//

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn<(query: string) => Partial<MediaQueryList>>().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn<MediaQueryList['addEventListener']>(),
  })),
});
