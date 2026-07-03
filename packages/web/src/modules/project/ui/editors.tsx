import {useStore} from '@nanostores/react';
import {nanoid} from 'nanoid';
import {useRef, useState} from 'react';

import {
  applyImportedProject,
  exportProjectFile,
  exportRuntimeFile,
  importProjectText,
} from '@/modules/persistence/files';
import {$project} from '@/modules/project/model/store';
import {
  deleteCharacter,
  deleteVariable,
  runCommand,
  upsertCharacter,
  upsertVariable,
} from '@/modules/workspace/model/commands';
import {Field, NumberInput, Select, SmallButton, TextInput} from '@/shared/ui/fields';

import type {Character, CharacterType, Variable, VariableType} from '@lorequary/core';
import type {ReactElement} from 'react';

//
// * Character editor
//

const CHARACTER_TYPES: {value: CharacterType; label: string}[] = [
  {value: 'character', label: 'Character'},
  {value: 'player', label: 'Player'},
  {value: 'skill_voice', label: 'Skill voice'},
  {value: 'narrator', label: 'Narrator'},
];

export const CharacterEditor = ({character}: {character: Character}): ReactElement => {
  const project = useStore($project);
  const numericVariables = (project?.variables ?? []).filter(variable => variable.type === 'number');

  const patch = (partial: Partial<Character>): void => {
    runCommand(doc => upsertCharacter(doc, {...character, ...partial}));
  };

  return (
    <div className='flex flex-col gap-2 rounded-md border border-ink-700 bg-ink-900/50 p-2'>
      <div className='grid grid-cols-[1fr_auto] gap-2'>
        <Field label='Display name'>
          <TextInput
            value={character.displayName}
            onCommit={next => patch({displayName: next, name: next.toLowerCase()})}
          />
        </Field>
        <Field label='Color'>
          <input
            type='color'
            className='h-6 w-10 cursor-pointer rounded border border-ink-600 bg-ink-950'
            value={character.color}
            onChange={event => patch({color: event.target.value})}
          />
        </Field>
      </div>
      <Field label='Type'>
        <Select
          value={character.type}
          options={CHARACTER_TYPES}
          onChange={next => patch({type: next as CharacterType})}
        />
      </Field>
      {character.type === 'skill_voice' && (
        <Field label='Skill variable'>
          <Select
            value={character.skillId ?? ''}
            options={[{value: '', label: '— pick —'}, ...numericVariables.map(v => ({value: v.id, label: v.name}))]}
            onChange={next => patch({skillId: next === '' ? undefined : next})}
          />
        </Field>
      )}
      <SmallButton danger onClick={() => runCommand(doc => deleteCharacter(doc, character.id))}>
        Delete character
      </SmallButton>
    </div>
  );
};

CharacterEditor.displayName = 'CharacterEditor';

const SPEAKER_TYPE_GLYPHS: Record<CharacterType, string> = {
  character: '◉',
  player: '➤',
  skill_voice: '✦',
  narrator: '◈',
};

export const CharactersPanel = (): ReactElement | null => {
  const project = useStore($project);
  const [expandedId, setExpandedId] = useState<string | undefined>(undefined);

  if (project === null) return null;

  return (
    <div className='flex flex-col gap-1'>
      {project.characters.map(character => (
        <div key={character.id} className='flex flex-col gap-1'>
          <button
            type='button'
            className='flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs text-zinc-200 hover:bg-ink-800/70'
            onClick={() => setExpandedId(expandedId === character.id ? undefined : character.id)}
          >
            <span className='text-[11px]' style={{color: character.color}}>
              {SPEAKER_TYPE_GLYPHS[character.type]}
            </span>
            <span className='flex-1 truncate'>{character.displayName}</span>
            <span className='text-[9px] uppercase text-zinc-500'>{character.type.replace('_', ' ')}</span>
          </button>
          {expandedId === character.id && <CharacterEditor character={character} />}
        </div>
      ))}
      <SmallButton
        onClick={() =>
          runCommand(doc =>
            upsertCharacter(doc, {
              id: nanoid(8),
              name: 'new_character',
              displayName: 'New Character',
              type: 'character',
              color: '#7a6ac0',
            }),
          )
        }
      >
        + New character
      </SmallButton>
    </div>
  );
};

CharactersPanel.displayName = 'CharactersPanel';

//
// * Variable editor
//

const VARIABLE_TYPES: {value: VariableType; label: string}[] = [
  {value: 'number', label: 'Number'},
  {value: 'string', label: 'String'},
  {value: 'boolean', label: 'Boolean'},
  {value: 'enum', label: 'Enum'},
];

const defaultValueFor = (type: VariableType): string | number | boolean => {
  if (type === 'number') return 0;
  if (type === 'boolean') return false;

  return '';
};

const DefaultValueField = ({
  variable,
  onPatch,
}: {
  variable: Variable;
  onPatch: (partial: Partial<Variable>) => void;
}): ReactElement => {
  if (variable.type === 'number') {
    return (
      <NumberInput
        value={typeof variable.defaultValue === 'number' ? variable.defaultValue : 0}
        onCommit={next => onPatch({defaultValue: next})}
      />
    );
  }

  if (variable.type === 'boolean') {
    return (
      <Select
        value={variable.defaultValue === true ? 'true' : 'false'}
        options={[
          {value: 'false', label: 'false'},
          {value: 'true', label: 'true'},
        ]}
        onChange={next => onPatch({defaultValue: next === 'true'})}
      />
    );
  }

  return (
    <TextInput
      value={typeof variable.defaultValue === 'string' ? variable.defaultValue : ''}
      onCommit={next => onPatch({defaultValue: next})}
    />
  );
};

DefaultValueField.displayName = 'DefaultValueField';

export const VariableEditor = ({variable}: {variable: Variable}): ReactElement => {
  const patch = (partial: Partial<Variable>): void => {
    runCommand(doc => upsertVariable(doc, {...variable, ...partial}));
  };

  return (
    <div className='flex flex-col gap-2 rounded-md border border-ink-700 bg-ink-900/50 p-2'>
      <div className='grid grid-cols-2 gap-2'>
        <Field label='Name'>
          <TextInput value={variable.name} onCommit={next => patch({name: next})} />
        </Field>
        <Field label='Type'>
          <Select
            value={variable.type}
            options={VARIABLE_TYPES}
            onChange={next => {
              const type = next as VariableType;

              patch({type, defaultValue: defaultValueFor(type)});
            }}
          />
        </Field>
      </div>
      <Field label='Key'>
        <TextInput mono value={variable.key} placeholder='hero.money' onCommit={next => patch({key: next})} />
      </Field>
      <Field label='Default value'>
        <DefaultValueField variable={variable} onPatch={patch} />
      </Field>
      {variable.type === 'enum' && (
        <Field label='Enum values (comma-separated)'>
          <TextInput
            value={(variable.enumValues ?? []).join(', ')}
            placeholder='friendly, neutral, hostile'
            onCommit={next =>
              patch({
                enumValues: next
                  .split(',')
                  .map(value => value.trim())
                  .filter(value => value !== ''),
              })
            }
          />
        </Field>
      )}
      <SmallButton danger onClick={() => runCommand(doc => deleteVariable(doc, variable.id))}>
        Delete variable
      </SmallButton>
    </div>
  );
};

VariableEditor.displayName = 'VariableEditor';

export const VariablesPanel = (): ReactElement | null => {
  const project = useStore($project);
  const [expandedId, setExpandedId] = useState<string | undefined>(undefined);

  if (project === null) return null;

  return (
    <div className='flex flex-col gap-1'>
      {project.variables.map(variable => (
        <div key={variable.id} className='flex flex-col gap-1'>
          <button
            type='button'
            className='flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-ink-800/70'
            onClick={() => setExpandedId(expandedId === variable.id ? undefined : variable.id)}
          >
            <span className='flex-1 truncate text-zinc-200'>{variable.name}</span>
            {variable.group !== undefined && (
              <span className='rounded-sm bg-ink-700/70 px-1 text-[9px] text-zinc-400'>{variable.group}</span>
            )}
            <span className='truncate font-mono text-[9px] text-zinc-500'>{variable.key}</span>
          </button>
          {expandedId === variable.id && <VariableEditor variable={variable} />}
        </div>
      ))}
      <SmallButton
        onClick={() =>
          runCommand(doc =>
            upsertVariable(doc, {
              id: nanoid(8),
              name: 'New Variable',
              key: `vars.v${doc.variables.length + 1}`,
              type: 'number',
              defaultValue: 0,
            }),
          )
        }
      >
        + New variable
      </SmallButton>
    </div>
  );
};

VariablesPanel.displayName = 'VariablesPanel';

//
// * Project file actions
//

export const ProjectActions = (): ReactElement | null => {
  const project = useStore($project);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | undefined>(undefined);
  const [importNotice, setImportNotice] = useState<string | undefined>(undefined);

  if (project === null) return null;

  const handleImport = async (file: File): Promise<void> => {
    const result = importProjectText(await file.text());

    if (!result.ok) {
      const issues = result.error.issues?.slice(0, 3).join('; ') ?? '';

      setImportError(`${result.error.message}${issues === '' ? '' : ` — ${issues}`}`);
      setImportNotice(undefined);
      return;
    }

    setImportError(undefined);
    setImportNotice(
      result.value.notes.length === 0
        ? undefined
        : `Migrated from an older format: ${result.value.notes.slice(0, 3).join('; ')}`,
    );
    applyImportedProject(result.value.project);
  };

  return (
    <div className='flex flex-col gap-1'>
      <div className='flex flex-wrap gap-1'>
        <SmallButton onClick={() => exportProjectFile(project)}>Export .lorequary</SmallButton>
        <SmallButton onClick={() => exportRuntimeFile(project)}>Export IR</SmallButton>
        <SmallButton onClick={() => fileInputRef.current?.click()}>Import</SmallButton>
      </div>
      {importError !== undefined && <p className='text-[10px] leading-snug text-red-400'>{importError}</p>}
      {importNotice !== undefined && <p className='text-[10px] leading-snug text-amber-400'>{importNotice}</p>}
      <input
        ref={fileInputRef}
        type='file'
        accept='.lorequary,application/json'
        className='hidden'
        onChange={event => {
          const file = event.target.files?.[0];

          event.target.value = '';

          if (file !== undefined) void handleImport(file);
        }}
      />
    </div>
  );
};

ProjectActions.displayName = 'ProjectActions';
