import {parseCondition, parseEffect, validate} from '@lorequary/parser';
import {useMemo} from 'react';

import {useLiveDraft} from '@/shared/hooks/useLiveDraft';
import {cn} from '@/shared/lib/cn';

import type {VariableSchema} from '@lorequary/parser';
import type {ReactElement} from 'react';

export type ExpressionMode = 'condition' | 'effect';

export const validateExpression = (source: string, mode: ExpressionMode, schema: VariableSchema): string | null => {
  if (source.trim() === '') return null;

  const parsed = mode === 'effect' ? parseEffect(source) : parseCondition(source);

  if (!parsed.ok) return parsed.error.message;

  return validate(parsed.value, schema)[0]?.message ?? null;
};

type ExpressionInputProps = {
  value: string;
  mode: ExpressionMode;
  schema: VariableSchema;
  placeholder?: string;
  onCommit: (next: string) => void;
};

export const ExpressionInput = ({value, mode, schema, placeholder, onCommit}: ExpressionInputProps): ReactElement => {
  // Valid states are committed live; invalid drafts stay local until blur flushes them.
  const {draft, handleChange, handleBlur} = useLiveDraft(
    value,
    onCommit,
    next => validateExpression(next, mode, schema) === null,
  );
  const error = useMemo(() => validateExpression(draft, mode, schema), [draft, mode, schema]);

  return (
    <div className='flex flex-col gap-0.5'>
      <input
        className={cn(
          'rounded border bg-ink-950 px-2 py-1 font-mono text-xs text-zinc-200 outline-none',
          error === null ? 'border-ink-600 focus:border-sky-700' : 'border-red-700 focus:border-red-500',
        )}
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        onChange={event => handleChange(event.target.value)}
        onBlur={handleBlur}
      />
      {error !== null && <span className='text-[10px] text-red-400'>{error}</span>}
    </div>
  );
};

ExpressionInput.displayName = 'ExpressionInput';
