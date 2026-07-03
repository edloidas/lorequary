import {useStore} from '@nanostores/react';
import {nanoid} from 'nanoid';

import {$project} from '@/modules/project/model/store';
import {runCommand, updateSettings} from '@/modules/workspace/model/commands';
import {Field, Select, SmallButton, TextInput} from '@/shared/ui/fields';

import type {CheckRollSettings, StageSlot} from '@lorequary/core';
import type {ReactElement} from 'react';

//
// * Slot list editor
//

// Shared editor for stage and expression slots — a named slot with author-defined options.
const SlotListEditor = ({
  slots,
  addLabel,
  optionsPlaceholder,
  onChange,
}: {
  slots: StageSlot[];
  addLabel: string;
  optionsPlaceholder: string;
  onChange: (next: StageSlot[] | undefined) => void;
}): ReactElement => {
  const patchSlot = (slotId: string, patch: Partial<StageSlot>): void => {
    onChange(slots.map(slot => (slot.id === slotId ? {...slot, ...patch} : slot)));
  };

  return (
    <div className='flex flex-col gap-2'>
      {slots.map(slot => (
        <div key={slot.id} className='flex flex-col gap-1 rounded border border-ink-800 p-2'>
          <TextInput value={slot.name} placeholder='Slot name' onCommit={next => patchSlot(slot.id, {name: next})} />
          <TextInput
            value={slot.options.join(', ')}
            placeholder={optionsPlaceholder}
            onCommit={next =>
              patchSlot(slot.id, {
                options: next
                  .split(',')
                  .map(option => option.trim())
                  .filter(option => option !== ''),
              })
            }
          />
          <SmallButton
            danger
            onClick={() => {
              const next = slots.filter(s => s.id !== slot.id);

              onChange(next.length === 0 ? undefined : next);
            }}
          >
            Remove slot
          </SmallButton>
        </div>
      ))}
      <SmallButton onClick={() => onChange([...slots, {id: nanoid(8), name: '', options: []}])}>{addLabel}</SmallButton>
    </div>
  );
};

SlotListEditor.displayName = 'SlotListEditor';

//
// * Check roll
//

const DEFAULT_ROLL: CheckRollSettings = {formula: '2d6'};

const CheckRollEditor = ({
  value,
  onChange,
}: {
  value: CheckRollSettings | undefined;
  onChange: (next: CheckRollSettings | undefined) => void;
}): ReactElement => {
  const current = value ?? DEFAULT_ROLL;

  return (
    <div className='flex flex-col gap-2'>
      <Select
        value={current.formula}
        options={[
          {value: '2d6', label: '2d6 (default)'},
          {value: '1d20', label: '1d20'},
        ]}
        onChange={next => onChange({...current, formula: next === '1d20' ? '1d20' : '2d6'})}
      />
      <label className='flex items-center gap-2 text-xs text-zinc-300'>
        <input
          type='checkbox'
          checked={current.critFail ?? true}
          onChange={event => onChange({...current, critFail: event.target.checked})}
        />
        Minimum roll always fails
      </label>
      <label className='flex items-center gap-2 text-xs text-zinc-300'>
        <input
          type='checkbox'
          checked={current.critSuccess ?? true}
          onChange={event => onChange({...current, critSuccess: event.target.checked})}
        />
        Maximum roll always succeeds
      </label>
    </div>
  );
};

CheckRollEditor.displayName = 'CheckRollEditor';

//
// * Panel
//

export const SettingsPanel = (): ReactElement | null => {
  const project = useStore($project);

  if (project === null) return null;

  return (
    <div className='flex flex-col gap-5'>
      <Field label='Stage slots — presentation state (place, music, visual)'>
        <SlotListEditor
          slots={project.settings.stageSlots ?? []}
          addLabel='+ Add stage slot'
          optionsPlaceholder='harbor, tavern, deck (comma-separated)'
          onChange={next => runCommand(doc => updateSettings(doc, {stageSlots: next}))}
        />
      </Field>

      <Field label='Expression slots — per-character presentation (emotion, pose)'>
        <SlotListEditor
          slots={project.settings.expressionSlots ?? []}
          addLabel='+ Add expression slot'
          optionsPlaceholder='calm, angry, smiling (comma-separated)'
          onChange={next => runCommand(doc => updateSettings(doc, {expressionSlots: next}))}
        />
      </Field>

      <Field label='Check roll'>
        <CheckRollEditor
          value={project.settings.checkRoll}
          onChange={next => runCommand(doc => updateSettings(doc, {checkRoll: next}))}
        />
      </Field>
    </div>
  );
};

SettingsPanel.displayName = 'SettingsPanel';
