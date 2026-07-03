import {useStore} from '@nanostores/react';
import {useState} from 'react';

import {$appView} from '@/modules/project/model/navigation';
import {$project} from '@/modules/project/model/store';
import {
  addDialogue,
  deleteDialogue,
  renameDialogue,
  renameProject,
  runCommand,
} from '@/modules/workspace/model/commands';
import {$activeGroupId, $currentDialogueId, clearSelection} from '@/modules/workspace/model/store';
import {cn} from '@/shared/lib/cn';
import {TextInput} from '@/shared/ui/fields';

import type {Dialogue} from '@lorequary/core';
import type {ReactElement} from 'react';

import {CharactersPanel, ProjectActions, VariablesPanel} from './editors';
import {SettingsPanel} from './SettingsPanel';

type Tab = 'dialogues' | 'characters' | 'variables' | 'settings';

const TABS: {id: Tab; label: string}[] = [
  {id: 'dialogues', label: 'Dialogues'},
  {id: 'characters', label: 'Characters'},
  {id: 'variables', label: 'Variables'},
  {id: 'settings', label: 'Settings'},
];

const countWords = (dialogue: Dialogue): number =>
  dialogue.nodes.reduce((sum, node) => {
    if (node.kind === 'hub' || node.kind === 'jump') return sum;

    const optionWords =
      node.kind === 'choice'
        ? node.options.reduce((inner, option) => inner + option.text.split(/\s+/).filter(Boolean).length, 0)
        : 0;

    return sum + node.text.split(/\s+/).filter(Boolean).length + optionWords;
  }, 0);

const entryPreview = (dialogue: Dialogue): string => {
  const entry = dialogue.nodes.find(node => node.id === dialogue.entryNodeId);
  const text = entry?.kind === 'line' || entry?.kind === 'choice' ? entry.text.trim() : '';

  return text === '' ? 'No opening line yet.' : text;
};

const CARD_CLASS =
  'group relative flex cursor-pointer flex-col gap-2 rounded-xl border border-ink-700 bg-ink-850 p-4 text-left transition-all hover:border-sky-700 hover:bg-ink-800 hover:shadow-[0_8px_30px_rgb(0_0_0/0.4)]';

const DialoguesGrid = (): ReactElement | null => {
  const project = useStore($project);

  if (project === null) return null;

  const openDialogue = (dialogueId: string): void => {
    $currentDialogueId.set(dialogueId);
    $activeGroupId.set(null);
    clearSelection();
    $appView.set('dialogue');
  };

  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
      {project.dialogues.map(dialogue => (
        <div
          key={dialogue.id}
          role='button'
          tabIndex={0}
          className={CARD_CLASS}
          onClick={() => openDialogue(dialogue.id)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') openDialogue(dialogue.id);
          }}
        >
          <div className='flex items-start justify-between gap-2'>
            <span className='truncate text-sm font-semibold text-zinc-100'>{dialogue.name}</span>
            <div className='hidden shrink-0 gap-1 group-hover:flex'>
              <button
                type='button'
                className='cursor-pointer rounded px-1 text-xs text-zinc-500 hover:text-zinc-200'
                title='Rename'
                onClick={event => {
                  event.stopPropagation();

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
                  className='cursor-pointer rounded px-1 text-xs text-zinc-500 hover:text-red-400'
                  title='Delete'
                  onClick={event => {
                    event.stopPropagation();

                    if (window.confirm(`Delete dialogue "${dialogue.name}"?`)) {
                      runCommand(doc => deleteDialogue(doc, dialogue.id));

                      if ($currentDialogueId.get() === dialogue.id) $currentDialogueId.set(null);
                    }
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          <p className='line-clamp-2 text-[11px] italic leading-relaxed text-zinc-500'>{entryPreview(dialogue)}</p>
          <div className='mt-auto flex gap-3 text-[11px] text-zinc-500'>
            <span>{dialogue.nodes.length} node(s)</span>
            <span>{dialogue.edges.length} link(s)</span>
            <span>{countWords(dialogue)} words</span>
          </div>
        </div>
      ))}

      <button
        type='button'
        className={CARD_CLASS}
        onClick={() => runCommand(doc => addDialogue(doc, `Dialogue ${doc.dialogues.length + 1}`))}
      >
        <span className='text-sm font-semibold text-sky-300'>＋ New dialogue</span>
        <span className='text-[11px] text-zinc-500'>A fresh canvas with a single entry line.</span>
      </button>
    </div>
  );
};

DialoguesGrid.displayName = 'DialoguesGrid';

export const ProjectDashboard = (): ReactElement | null => {
  const project = useStore($project);
  const [tab, setTab] = useState<Tab>('dialogues');

  if (project === null) return null;

  return (
    <div className='flex h-screen flex-col overflow-y-auto bg-ink-950 text-zinc-200'>
      <header className='border-b border-ink-800 bg-ink-900/60'>
        <div className='mx-auto flex w-full max-w-5xl flex-col gap-3 px-6 pt-6'>
          <div className='flex items-center gap-2 text-xs text-zinc-500'>
            <button
              type='button'
              className='cursor-pointer font-semibold text-zinc-300 hover:text-sky-300'
              onClick={() => $appView.set('home')}
            >
              Lorequary
            </button>
            <span>/</span>
            <span className='truncate text-zinc-400'>{project.meta.name}</span>
          </div>
          <div className='flex items-end justify-between gap-4'>
            <div className='w-full max-w-sm'>
              <TextInput
                value={project.meta.name}
                placeholder='Project name'
                onCommit={next => {
                  if (next.trim() !== '') runCommand(doc => renameProject(doc, next.trim()));
                }}
              />
            </div>
            <ProjectActions />
          </div>
          <div className='flex gap-1'>
            {TABS.map(entry => (
              <button
                key={entry.id}
                type='button'
                className={cn(
                  'cursor-pointer rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors',
                  tab === entry.id
                    ? 'border border-b-0 border-ink-700 bg-ink-950 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300',
                )}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className='mx-auto w-full max-w-5xl flex-1 px-6 py-6'>
        {tab === 'dialogues' && <DialoguesGrid />}
        {tab === 'characters' && (
          <div className='max-w-md'>
            <CharactersPanel />
          </div>
        )}
        {tab === 'variables' && (
          <div className='max-w-md'>
            <VariablesPanel />
          </div>
        )}
        {tab === 'settings' && (
          <div className='max-w-md'>
            <SettingsPanel />
          </div>
        )}
      </main>
    </div>
  );
};

ProjectDashboard.displayName = 'ProjectDashboard';
