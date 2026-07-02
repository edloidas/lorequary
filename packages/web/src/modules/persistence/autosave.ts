import type {ReadableAtom} from 'nanostores';

export const AUTOSAVE_DELAY_MS = 2000;

// Debounced autosave: waits for a quiet period after the last change, then persists the latest value.
export const startAutosave = <T>(
  $store: ReadableAtom<T | null>,
  save: (value: T) => void,
  delay = AUTOSAVE_DELAY_MS,
): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const unsubscribe = $store.listen(value => {
    if (value === null) return;

    clearTimeout(timer);
    timer = setTimeout(() => save(value), delay);
  });

  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
};
