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
  addDialogue,
  deleteCharacter,
  deleteDialogue,
  deleteVariable,
  renameDialogue,
  runCommand,
  upsertCharacter,
  upsertVariable,
} from '@/modules/workspace/model/commands';
import {$currentDialogueId, clearSelection} from '@/modules/workspace/model/store';
import {cn} from '@/shared/lib/cn';
import {Field, NumberInput, Select, SmallButton, TextInput} from '@/shared/ui/fields';

import type {Character, CharacterType, Variable, VariableType} from '@lorequary/core';
import type {ReactElement} from 'react';

type Tab = 'dialogues' | 'characters' | 'variables';

//
// * Dialogues
//

const DialoguesTab = (): ReactElement | null => {
  const project = useStore($project);
  const currentId = useStore($currentDialogueId);

  if (project === null) return null;

  const activeId = currentId ?? project.dialogues[0]?.id;

  return (
    <div className='flex flex-col gap-1'>
      {project.dialogues.map(dialogue => (
        <div
          key={dialogue.id}
          className={cn(
            'group flex items-center gap-1 rounded px-1 py-0.5',
            dialogue.id === activeId ? 'bg-neutral-800' : 'hover:bg-neutral-800/50',
          )}
        >
          <button
            type='button'
            className='flex-1 truncate px-1 py-0.5 text-left text-xs text-neutral-200'
            onClick={() => {
              $currentDialogueId.set(dialogue.id);
              clearSelection();
            }}
          >
            {dialogue.name}
          </button>
          <button
            type='button'
            className='hidden px-1 text-[10px] text-neutral-500 hover:text-neutral-300 group-hover:block'
            title='Rename'
            onClick={() => {
              const name = window.prompt('Dialogue name', dialogue.name);

              if (name !== null && name.trim() !== '') {
                runCommand(doc => renameDialogue(doc, dialogue.id, name.trim()));
              }
            }}
          >
            ✎
          </button>
          {project.dialogues.length > 1 && (
            <button
              type='button'
              className='hidden px-1 text-[10px] text-red-500 hover:text-red-300 group-hover:block'
              title='Delete'
              onClick={() => {
                if (window.confirm(`Delete dialogue "${dialogue.name}"?`)) {
                  runCommand(doc => deleteDialogue(doc, dialogue.id));

                  if (activeId === dialogue.id) $currentDialogueId.set(null);
                }
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <SmallButton onClick={() => runCommand(doc => addDialogue(doc, `Dialogue ${doc.dialogues.length + 1}`))}>
        + New dialogue
      </SmallButton>
    </div>
  );
};

DialoguesTab.displayName = 'DialoguesTab';

//
// * Characters
//

const CHARACTER_TYPES: {value: CharacterType; label: string}[] = [
  {value: 'character', label: 'Character'},
  {value: 'player', label: 'Player'},
  {value: 'skill_voice', label: 'Skill voice'},
  {value: 'narrator', label: 'Narrator'},
];

const CharacterEditor = ({character}: {character: Character}): ReactElement => {
  const project = useStore($project);
  const numericVariables = (project?.variables ?? []).filter(variable => variable.type === 'number');

  const patch = (partial: Partial<Character>): void => {
    runCommand(doc => upsertCharacter(doc, {...character, ...partial}));
  };

  return (
    <div className='flex flex-col gap-2 rounded border border-neutral-800 p-2'>
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
            className='h-6 w-10 cursor-pointer rounded border border-neutral-700 bg-neutral-900'
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

const CharactersTab = (): ReactElement | null => {
  const project = useStore($project);
  const [expandedId, setExpandedId] = useState<string | undefined>(undefined);

  if (project === null) return null;

  return (
    <div className='flex flex-col gap-1'>
      {project.characters.map(character => (
        <div key={character.id} className='flex flex-col gap-1'>
          <button
            type='button'
            className='flex items-center gap-2 rounded px-1 py-1 text-left text-xs text-neutral-200 hover:bg-neutral-800/60'
            onClick={() => setExpandedId(expandedId === character.id ? undefined : character.id)}
          >
            <span className='h-2.5 w-2.5 shrink-0 rounded-full' style={{backgroundColor: character.color}} />
            <span className='flex-1 truncate'>{character.displayName}</span>
            <span className='text-[9px] uppercase text-neutral-500'>{character.type}</span>
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

CharactersTab.displayName = 'CharactersTab';

//
// * Variables
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

const VariableEditor = ({variable}: {variable: Variable}): ReactElement => {
  const patch = (partial: Partial<Variable>): void => {
    runCommand(doc => upsertVariable(doc, {...variable, ...partial}));
  };

  return (
    <div className='flex flex-col gap-2 rounded border border-neutral-800 p-2'>
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

const VariablesTab = (): ReactElement | null => {
  const project = useStore($project);
  const [expandedId, setExpandedId] = useState<string | undefined>(undefined);

  if (project === null) return null;

  return (
    <div className='flex flex-col gap-1'>
      {project.variables.map(variable => (
        <div key={variable.id} className='flex flex-col gap-1'>
          <button
            type='button'
            className='flex items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-neutral-800/60'
            onClick={() => setExpandedId(expandedId === variable.id ? undefined : variable.id)}
          >
            <span className='flex-1 truncate text-neutral-200'>{variable.name}</span>
            <span className='truncate font-mono text-[9px] text-neutral-500'>{variable.key}</span>
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

VariablesTab.displayName = 'VariablesTab';

//
// * Sidebar
//

const ProjectActions = (): ReactElement | null => {
  const project = useStore($project);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | undefined>(undefined);

  if (project === null) return null;

  const handleImport = async (file: File): Promise<void> => {
    const result = importProjectText(await file.text());

    if (!result.ok) {
      const issues = result.error.issues?.slice(0, 3).join('; ') ?? '';

      setImportError(`${result.error.message}${issues === '' ? '' : ` — ${issues}`}`);
      return;
    }

    setImportError(undefined);
    applyImportedProject(result.value);
  };

  return (
    <div className='flex flex-col gap-1 border-t border-neutral-800 p-2'>
      <div className='flex gap-1'>
        <SmallButton onClick={() => exportProjectFile(project)}>Export .lorequary</SmallButton>
        <SmallButton onClick={() => exportRuntimeFile(project)}>Export IR</SmallButton>
        <SmallButton onClick={() => fileInputRef.current?.click()}>Import</SmallButton>
      </div>
      {importError !== undefined && <p className='text-[10px] leading-snug text-red-400'>{importError}</p>}
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

const TABS: {id: Tab; label: string}[] = [
  {id: 'dialogues', label: 'Dialogues'},
  {id: 'characters', label: 'Cast'},
  {id: 'variables', label: 'Variables'},
];

export const Sidebar = (): ReactElement => {
  const [tab, setTab] = useState<Tab>('dialogues');

  return (
    <aside className='flex w-64 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900'>
      <div className='flex items-center gap-2 border-b border-neutral-800 px-3 py-2'>
        <span className='text-sm font-bold tracking-tight text-neutral-100'>Lorequary</span>
      </div>
      <div className='flex border-b border-neutral-800'>
        {TABS.map(entry => (
          <button
            key={entry.id}
            type='button'
            className={cn(
              'flex-1 px-2 py-1.5 text-[11px] font-medium',
              tab === entry.id ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-500 hover:text-neutral-300',
            )}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className='flex-1 overflow-y-auto p-2'>
        {tab === 'dialogues' && <DialoguesTab />}
        {tab === 'characters' && <CharactersTab />}
        {tab === 'variables' && <VariablesTab />}
      </div>
      <ProjectActions />
    </aside>
  );
};

Sidebar.displayName = 'Sidebar';
