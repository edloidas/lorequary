import {endCoalescing} from '@/modules/workspace/model/commands';
import {useLiveDraft} from '@/shared/hooks/useLiveDraft';
import {cn} from '@/shared/lib/cn';

import type {ReactElement, ReactNode} from 'react';

export const Field = ({label, children}: {label: string; children: ReactNode}): ReactElement => (
  <label className='flex flex-col gap-1 text-[11px] font-medium tracking-wide text-zinc-400'>
    {label}
    {children}
  </label>
);

Field.displayName = 'Field';

export const INPUT_CLASS =
  'rounded border border-ink-600 bg-ink-950 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-sky-700';

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
  const {draft, handleChange, handleBlur} = useLiveDraft(value, onCommit);

  return (
    <input
      className={cn(INPUT_CLASS, mono && 'font-mono')}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={event => handleChange(event.target.value)}
      onBlur={handleBlur}
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
  const {draft, handleChange, handleBlur} = useLiveDraft(value, onCommit);

  return (
    <textarea
      className={cn(INPUT_CLASS, 'resize-y')}
      value={draft}
      placeholder={placeholder}
      rows={rows}
      onChange={event => handleChange(event.target.value)}
      onBlur={handleBlur}
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

const isNumeric = (raw: string): boolean => raw.trim() !== '' && !Number.isNaN(Number(raw));

export const NumberInput = ({value, onCommit}: {value: number; onCommit: (next: number) => void}): ReactElement => {
  const {draft, handleChange, handleBlur} = useLiveDraft(String(value), next => onCommit(Number(next)), isNumeric);

  return (
    <input
      className={INPUT_CLASS}
      value={draft}
      inputMode='numeric'
      onChange={event => handleChange(event.target.value)}
      onBlur={() => {
        // Never flush an unparseable draft into a number field.
        if (isNumeric(draft)) {
          handleBlur();
          return;
        }

        endCoalescing();
        handleChange(String(value));
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
      'rounded border border-ink-600 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-ink-800',
      danger && 'border-red-900 text-red-400 hover:bg-red-950',
    )}
    onClick={onClick}
  >
    {children}
  </button>
);

SmallButton.displayName = 'SmallButton';
