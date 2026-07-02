import {useStore} from '@nanostores/react';
import {useState} from 'react';

import {$appView} from '@/modules/project/model/navigation';
import {$project} from '@/modules/project/model/store';
import {addDialogue, deleteDialogue, renameDialogue, runCommand} from '@/modules/workspace/model/commands';
import {$activeGroupId, $currentDialogueId, clearSelection} from '@/modules/workspace/model/store';
import {cn} from '@/shared/lib/cn';
import {SmallButton} from '@/shared/ui/fields';

import type {ReactElement} from 'react';

import {CharactersPanel, ProjectActions, VariablesPanel} from './editors';

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
            'group flex items-center gap-1 rounded-md px-1 py-0.5',
            dialogue.id === activeId ? 'bg-ink-800' : 'hover:bg-ink-800/50',
          )}
        >
          <button
            type='button'
            className='flex-1 cursor-pointer truncate px-1 py-0.5 text-left text-xs text-zinc-200'
            onClick={() => {
              $currentDialogueId.set(dialogue.id);
              $activeGroupId.set(null);
              clearSelection();
            }}
          >
            {dialogue.name}
          </button>
          <button
            type='button'
            className='hidden cursor-pointer px-1 text-[10px] text-zinc-500 hover:text-zinc-300 group-hover:block'
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
              className='hidden cursor-pointer px-1 text-[10px] text-red-500 hover:text-red-300 group-hover:block'
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
// * Sidebar
//

const TABS: {id: Tab; label: string}[] = [
  {id: 'dialogues', label: 'Dialogues'},
  {id: 'characters', label: 'Cast'},
  {id: 'variables', label: 'Variables'},
];

export const Sidebar = (): ReactElement => {
  const project = useStore($project);
  const [tab, setTab] = useState<Tab>('dialogues');

  return (
    <div className='flex h-full flex-col border-r border-ink-800 bg-ink-900'>
      <div className='flex items-center gap-2 border-b border-ink-800 px-3 py-2'>
        <button
          type='button'
          className='cursor-pointer text-sm font-bold tracking-tight text-zinc-100 hover:text-sky-300'
          title='Back to projects'
          onClick={() => $appView.set('home')}
        >
          Lorequary
        </button>
        <span className='text-zinc-600'>/</span>
        <button
          type='button'
          className='min-w-0 cursor-pointer truncate text-xs text-zinc-400 hover:text-zinc-100'
          title='Back to project dashboard'
          onClick={() => $appView.set('project')}
        >
          {project?.meta.name ?? ''}
        </button>
      </div>
      <div className='flex border-b border-ink-800'>
        {TABS.map(entry => (
          <button
            key={entry.id}
            type='button'
            className={cn(
              'flex-1 cursor-pointer px-2 py-1.5 text-[11px] font-medium transition-colors',
              tab === entry.id ? 'bg-ink-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300',
            )}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className='flex-1 overflow-y-auto p-2'>
        {tab === 'dialogues' && <DialoguesTab />}
        {tab === 'characters' && <CharactersPanel />}
        {tab === 'variables' && <VariablesPanel />}
      </div>
      <div className='border-t border-ink-800 p-2'>
        <ProjectActions />
      </div>
    </div>
  );
};

Sidebar.displayName = 'Sidebar';
