import {useCommitted} from '@/shared/hooks/useCommitted';
import {cn} from '@/shared/lib/cn';

import type {ReactElement, ReactNode} from 'react';

export const Field = ({label, children}: {label: string; children: ReactNode}): ReactElement => (
  <label className='flex flex-col gap-1 text-[11px] font-medium tracking-wide text-neutral-400'>
    {label}
    {children}
  </label>
);

Field.displayName = 'Field';

export const INPUT_CLASS =
  'rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-neutral-500';

export const TextInput = ({
  value,
  placeholder,
  mono,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  mono?: boolean;
  onCommit: (next: string) => void;
}): ReactElement => {
  const {draft, setDraft, flush} = useCommitted(value, onCommit);

  return (
    <input
      className={cn(INPUT_CLASS, mono && 'font-mono')}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={event => setDraft(event.target.value)}
      onBlur={flush}
      onKeyDown={event => {
        if (event.key === 'Enter') flush();
      }}
    />
  );
};

TextInput.displayName = 'TextInput';

export const TextArea = ({
  value,
  placeholder,
  rows = 3,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  rows?: number;
  onCommit: (next: string) => void;
}): ReactElement => {
  const {draft, setDraft, flush} = useCommitted(value, onCommit);

  return (
    <textarea
      className={cn(INPUT_CLASS, 'resize-y')}
      value={draft}
      placeholder={placeholder}
      rows={rows}
      onChange={event => setDraft(event.target.value)}
      onBlur={flush}
    />
  );
};

TextArea.displayName = 'TextArea';

export const Select = ({
  value,
  options,
  onChange,
}: {
  value: string;
  options: {value: string; label: string}[];
  onChange: (next: string) => void;
}): ReactElement => (
  <select className={INPUT_CLASS} value={value} onChange={event => onChange(event.target.value)}>
    {options.map(option => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

Select.displayName = 'Select';

export const NumberInput = ({value, onCommit}: {value: number; onCommit: (next: number) => void}): ReactElement => {
  const {draft, setDraft, flush} = useCommitted(String(value), next => {
    const parsed = Number(next);

    if (!Number.isNaN(parsed)) onCommit(parsed);
  });

  return (
    <input
      className={INPUT_CLASS}
      value={draft}
      inputMode='numeric'
      onChange={event => setDraft(event.target.value)}
      onBlur={flush}
      onKeyDown={event => {
        if (event.key === 'Enter') flush();
      }}
    />
  );
};

NumberInput.displayName = 'NumberInput';

export const SmallButton = ({
  children,
  danger,
  onClick,
}: {
  children: ReactNode;
  danger?: boolean;
  onClick: () => void;
}): ReactElement => (
  <button
    type='button'
    className={cn(
      'rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800',
      danger && 'border-red-900 text-red-400 hover:bg-red-950',
    )}
    onClick={onClick}
  >
    {children}
  </button>
);

SmallButton.displayName = 'SmallButton';
