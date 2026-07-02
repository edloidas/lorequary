import {nanoid} from 'nanoid';
import {useEffect, useRef, useState} from 'react';

import {coalesced, endCoalescing} from '@/modules/workspace/model/commands';

// Live-commit input state: every committable change is written to the document
// immediately, coalesced into a single undo entry per editing session (field mount).
// Blur flushes uncommitted drafts (e.g. an invalid expression) and seals the undo burst.
export const useLiveDraft = (
  value: string,
  commit: (next: string) => void,
  isCommittable: (next: string) => boolean = () => true,
): {draft: string; handleChange: (next: string) => void; handleBlur: () => void} => {
  const keyRef = useRef(`field-${nanoid(6)}`);
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);

  useEffect(() => {
    // External change (undo, issue click, another field) — resync the draft.
    if (value !== draftRef.current) {
      draftRef.current = value;
      setDraft(value);
    }
  }, [value]);

  const handleChange = (next: string): void => {
    draftRef.current = next;
    setDraft(next);

    if (next !== value && isCommittable(next)) {
      coalesced(keyRef.current, () => commit(next));
    }
  };

  const handleBlur = (): void => {
    if (draft !== value) {
      coalesced(keyRef.current, () => commit(draft));
    }

    endCoalescing();
  };

  return {draft, handleChange, handleBlur};
};
