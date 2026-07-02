import {useEffect, useState} from 'react';

// Local-while-editing input state: tracks the upstream value, but only calls
// commit on blur/Enter so typing does not flood the undo history.
export const useCommitted = (
  value: string,
  commit: (next: string) => void,
): {draft: string; setDraft: (next: string) => void; flush: () => void} => {
  const [draft, setDraft] = useState(value);
  const [focusedValue, setFocusedValue] = useState(value);

  useEffect(() => {
    setDraft(value);
    setFocusedValue(value);
  }, [value]);

  const flush = (): void => {
    if (draft !== focusedValue) commit(draft);
  };

  return {draft, setDraft, flush};
};
